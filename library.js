'use strict';

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const user = require.main.require('./src/user');
const categories = require.main.require('./src/categories');
const privileges = require.main.require('./src/privileges');
const meta = require.main.require('./src/meta');
const translator = require.main.require('./src/translator');
const routeHelpers = require.main.require('./src/routes/helpers');
const controllerHelpers = require.main.require('./src/controllers/helpers');

const Plugin = {};

// All manageable fields as defined in the PRD
Plugin.allFields = [
	'name', 'handle', 'description', 'topicTemplate',
	'parentCid', 'numRecentReplies', 'subCategoriesPerPage',
	'minTags', 'maxTags', 'tagWhitelist', 'link', 'isSection',
	'postQueue', 'backgroundImage', 'bgColor', 'color',
	'imageClass', 'class',
];

// Sidebar actions available
Plugin.sidebarActions = ['viewCategory', 'analytics'];

// Validation limits for numeric fields
Plugin.numericFieldLimits = {
	numRecentReplies: { max: 100, min: 0 },
	subCategoriesPerPage: { max: 50, min: 0 },
	minTags: { max: 100, min: 0 },
	maxTags: { max: 100, min: 0 },
	parentCid: { min: 0 },
};

// Default configuration
Plugin.defaultConfig = {
	enabledFields: {
		name: false,
		description: true,
		handle: false,
		topicTemplate: true,
		parentCid: false,
		numRecentReplies: true,
		subCategoriesPerPage: false,
		minTags: false,
		maxTags: false,
		tagWhitelist: false,
		link: false,
		isSection: false,
		postQueue: true,
		backgroundImage: false,
		bgColor: false,
		color: false,
		imageClass: false,
		class: false,
	},
	enabledSidebarActions: {
		viewCategory: true,
		analytics: false,
	},
};

/**
 * Get plugin configuration from meta.settings
 */
Plugin.getConfig = async function () {
	const settings = await meta.settings.get('moderation-tools');
	const config = JSON.parse(JSON.stringify(Plugin.defaultConfig));

	if (settings && settings.enabledFields) {
		try {
			const fields = JSON.parse(settings.enabledFields);
			if (fields && typeof fields === 'object') {
				Object.assign(config.enabledFields, fields);
			}
		} catch (e) {
			winston.warn('[plugins/moderation-tools] Failed to parse enabledFields config');
		}
	}

	if (settings && settings.enabledSidebarActions) {
		try {
			const actions = JSON.parse(settings.enabledSidebarActions);
			if (actions && typeof actions === 'object') {
				Object.assign(config.enabledSidebarActions, actions);
			}
		} catch (e) {
			winston.warn('[plugins/moderation-tools] Failed to parse enabledSidebarActions config');
		}
	}

	return config;
};

/**
 * Validate cid parameter
 * @param {string|number} cid
 * @returns {number|null} parsed cid or null if invalid
 */
Plugin.validateCid = function (cid) {
	const parsed = parseInt(cid, 10);
	if (isNaN(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
};

/**
 * Validate handle format (URL-safe: alphanumeric, hyphens, underscores)
 * @param {string} handle
 * @returns {boolean}
 */
Plugin.isValidHandle = function (handle) {
	return typeof handle === 'string' && /^[\w-]+$/.test(handle);
};

/**
 * Validate URL format
 * @param {string} url
 * @returns {boolean}
 */
Plugin.isValidUrl = function (url) {
	if (!url || typeof url !== 'string') {
		return true; // empty is ok, will be cleared
	}
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch (e) {
		return false;
	}
};

/**
 * Validate numeric field value against defined limits
 * @param {string} field
 * @param {number} value
 * @returns {{ valid: boolean, message: string|null }}
 */
Plugin.validateNumericField = function (field, value) {
	const limits = Plugin.numericFieldLimits[field];
	if (!limits) {
		return { valid: true, message: null };
	}
	if (value < limits.min) {
		return { valid: false, message: `[[error:invalid-data, ${field} must be >= ${limits.min}]]` };
	}
	if (limits.max !== undefined && value > limits.max) {
		return { valid: false, message: `[[error:invalid-data, ${field} must be <= ${limits.max}]]` };
	}
	return { valid: true, message: null };
};

/**
 * Log error internally and return a safe error object for the API response
 * @param {Error} err - original error
 * @param {string} fallbackKey - i18n key for the generic message
 * @returns {Error}
 */
Plugin.safeApiError = function (err, fallbackKey) {
	winston.error('[plugins/moderation-tools] ' + (err.stack || err.message));
	return new Error(fallbackKey || '[[error:internal-server-error]]');
};

/**
 * Initialize plugin - register routes and socket methods
 */
Plugin.init = async function (params) {
	const { router, middleware } = params;

	// Frontend moderation tools page
	routeHelpers.setupPageRoute(
		router,
		'/extra-tools/moderation-tools',
		[middleware.ensureLoggedIn],
		Plugin.renderModerationPage
	);

	// ACP configuration page
	routeHelpers.setupAdminPageRoute(
		router,
		'/admin/plugins/moderation-tools',
		[middleware.pluginHooks],
		Plugin.renderAdminPage
	);

	// Socket methods for saving configuration
	const SocketPlugins = require.main.require('./src/socket.io/plugins');
	SocketPlugins['moderation-tools'] = {
		saveSettings: Plugin.socketSaveSettings,
	};
};

/**
 * Register API routes
 * Routes are mounted under /api/v3/plugins/ via static:api.routes hook
 */
Plugin.addApiRoutes = async function ({ router, middleware, helpers }) {
	const apiMiddleware = [middleware.ensureLoggedIn];

	// Get list of categories the user can moderate
	routeHelpers.setupApiRoute(router, 'get', '/extra-tools/moderation-tools/categories', apiMiddleware, async (req, res) => {
		try {
			const uid = req.uid;
			const isAdmin = await user.isAdministrator(uid);
			const isGlobalMod = await user.isGlobalModerator(uid);

			let cids;
			if (isAdmin || isGlobalMod) {
				cids = await categories.getAllCidsFromSet('categories:cid');
			} else {
				const allCids = await categories.getAllCidsFromSet('categories:cid');
				cids = await privileges.categories.filterCids('moderate', allCids, uid);
			}

			const categoryData = await categories.getCategoriesFields(cids, ['cid', 'name', 'icon', 'bgColor', 'color', 'parentCid', 'disabled']);
			const validCategories = categoryData.filter(c => c && !c.disabled);

			helpers.formatApiResponse(200, res, { categories: validCategories });
		} catch (err) {
			helpers.formatApiResponse(500, res, Plugin.safeApiError(err));
		}
	});

	// Get category data for editing (only authorized fields)
	routeHelpers.setupApiRoute(router, 'get', '/extra-tools/moderation-tools/category/:cid', apiMiddleware, async (req, res) => {
		try {
			// Fix 9: Validate cid parameter
			const cid = Plugin.validateCid(req.params.cid);
			if (!cid) {
				return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data]]'));
			}

			const uid = req.uid;

			// Verify user has moderate privilege for this category
			const hasPrivilege = await privileges.categories.isAdminOrMod(cid, uid);
			if (!hasPrivilege) {
				return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
			}

			// Get full category data
			const categoryData = await categories.getCategoryData(cid);
			if (!categoryData || !categoryData.cid) {
				return helpers.formatApiResponse(404, res, new Error('[[error:category-not-found]]'));
			}

			// Get config to determine which fields are enabled
			const config = await Plugin.getConfig();
			const enabledFields = config.enabledFields;

			// Filter to only return enabled fields
			const filteredData = {};
			for (const field of Plugin.allFields) {
				if (enabledFields[field]) {
					filteredData[field] = categoryData[field] !== undefined ? categoryData[field] : '';
				}
			}
			filteredData.cid = cid;
			filteredData.name = categoryData.name; // Always include name for display
			filteredData.icon = categoryData.icon; // Always include icon for display

			helpers.formatApiResponse(200, res, {
				category: filteredData,
				config: {
					enabledFields: enabledFields,
					enabledSidebarActions: config.enabledSidebarActions,
				},
			});
		} catch (err) {
			helpers.formatApiResponse(500, res, Plugin.safeApiError(err));
		}
	});

	// Save category data (only authorized fields)
	routeHelpers.setupApiRoute(router, 'put', '/extra-tools/moderation-tools/category/:cid', apiMiddleware, async (req, res) => {
		try {
			// Fix 9: Validate cid parameter
			const cid = Plugin.validateCid(req.params.cid);
			if (!cid) {
				return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data]]'));
			}

			const uid = req.uid;

			// Verify user has moderate privilege for this category
			const hasPrivilege = await privileges.categories.isAdminOrMod(cid, uid);
			if (!hasPrivilege) {
				return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
			}

			// Verify category exists
			const existingCategory = await categories.getCategoryData(cid);
			if (!existingCategory || !existingCategory.cid) {
				return helpers.formatApiResponse(404, res, new Error('[[error:category-not-found]]'));
			}

			// Get config to determine which fields are enabled
			const config = await Plugin.getConfig();
			const enabledFields = config.enabledFields;

			// Filter submitted data to only include enabled fields
			const updateData = {};
			for (const field of Plugin.allFields) {
				if (enabledFields[field] && req.body.hasOwnProperty(field)) {
					updateData[field] = req.body[field];
				}
			}

			// Validate required fields
			if (enabledFields.name && updateData.hasOwnProperty('name')) {
				if (!updateData.name || !updateData.name.toString().trim()) {
					return helpers.formatApiResponse(400, res, new Error('[[error:category-name-required]]'));
				}
			}

			// Fix 4: Handle format and uniqueness validation
			if (updateData.hasOwnProperty('handle') && updateData.handle) {
				if (!Plugin.isValidHandle(updateData.handle)) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-handle]]'));
				}
				const handleTaken = await categories.existsByHandle(updateData.handle);
				if (handleTaken) {
					// existsByHandle returns true if ANY category uses this handle
					const existingHandle = await categories.getCategoryField(cid, 'handle');
					if (existingHandle !== updateData.handle) {
						return helpers.formatApiResponse(400, res, new Error('[[error:category-handle-already-exists]]'));
					}
				}
			}

			// Fix 10: parentCid existence validation
			if (updateData.hasOwnProperty('parentCid') && updateData.parentCid > 0) {
				const parentExists = await categories.getCategoryData(parseInt(updateData.parentCid, 10));
				if (!parentExists || !parentExists.cid) {
					return helpers.formatApiResponse(400, res, new Error('[[error:category-not-found, parent]]'));
				}
			}

			// Handle boolean fields
			const boolFields = ['isSection', 'postQueue'];
			for (const field of boolFields) {
				if (updateData.hasOwnProperty(field)) {
					updateData[field] = updateData[field] ? 1 : 0;
				}
			}

			// Handle numeric fields with validation (Fix 6: upper limits)
			const numFields = ['numRecentReplies', 'subCategoriesPerPage', 'minTags', 'maxTags', 'parentCid'];
			for (const field of numFields) {
				if (updateData.hasOwnProperty(field)) {
					updateData[field] = parseInt(updateData[field], 10) || 0;
					const validation = Plugin.validateNumericField(field, updateData[field]);
					if (!validation.valid) {
						return helpers.formatApiResponse(400, res, new Error(validation.message));
					}
				}
			}

			// Fix 12: minTags should not exceed maxTags
			if (updateData.hasOwnProperty('minTags') && updateData.hasOwnProperty('maxTags')) {
				if (updateData.minTags > updateData.maxTags) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, minTags must not exceed maxTags]]'));
				}
			}

			// Fix 11: Validate link field as valid URL
			if (updateData.hasOwnProperty('link')) {
				if (!Plugin.isValidUrl(updateData.link)) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, link must be a valid URL]]'));
				}
			}

			// Save using NodeBB's built-in categories.update
			await categories.update({ [cid]: updateData });

			helpers.formatApiResponse(200, res, { cid: cid, updated: Object.keys(updateData) });
		} catch (err) {
			helpers.formatApiResponse(500, res, Plugin.safeApiError(err));
		}
	});

	// Fix 3: Get plugin config - requires admin or moderator privileges
	routeHelpers.setupApiRoute(router, 'get', '/extra-tools/moderation-tools/config', apiMiddleware, async (req, res) => {
		try {
			const uid = req.uid;
			const isAdmin = await user.isAdministrator(uid);
			const isGlobalMod = await user.isGlobalModerator(uid);
			const isModerator = isAdmin || isGlobalMod || await user.isModeratorOfAnyCategory(uid);

			if (!isModerator) {
				return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
			}

			const config = await Plugin.getConfig();
			helpers.formatApiResponse(200, res, config);
		} catch (err) {
			helpers.formatApiResponse(500, res, Plugin.safeApiError(err));
		}
	});
};

/**
 * Render the frontend moderation tools page
 */
Plugin.renderModerationPage = async function (req, res, next) {
	const uid = req.uid;

	// Check if user has any moderation privileges
	const isAdmin = await user.isAdministrator(uid);
	const isGlobalMod = await user.isGlobalModerator(uid);

	if (!isAdmin && !isGlobalMod) {
		const isMod = await user.isModeratorOfAnyCategory(uid);
		if (!isMod) {
			return controllerHelpers.redirect(res, '/');
		}
	}

	// Get config
	const config = await Plugin.getConfig();

	// Fix 1: Translate strings for JS use and pass via ajaxify.data
	const userSettings = await user.getSettings(uid);
	const userLang = userSettings.userLang || meta.config.defaultLang || 'en-GB';
	const t = new translator(userLang);
	const [saveText, savingText, saveSuccessText, unsavedChangesText, loadFailedText, saveFailedText] = await Promise.all([
		t.translate('[[moderation-tools:save]]'),
		t.translate('[[moderation-tools:saving]]'),
		t.translate('[[moderation-tools:save-success]]'),
		t.translate('[[moderation-tools:unsaved-changes]]'),
		t.translate('[[moderation-tools:load-failed]]'),
		t.translate('[[moderation-tools:save-failed]]'),
	]);

	// Get the initial cid from query parameter
	const initialCid = req.query.cid ? parseInt(req.query.cid, 10) : null;

	// Get categories user can manage
	let cids;
	if (isAdmin || isGlobalMod) {
		cids = await categories.getAllCidsFromSet('categories:cid');
	} else {
		const allCids = await categories.getAllCidsFromSet('categories:cid');
		cids = await privileges.categories.filterCids('moderate', allCids, uid);
	}

	const categoryData = await categories.getCategoriesFields(cids, ['cid', 'name', 'icon', 'bgColor', 'color', 'parentCid', 'disabled']);
	const validCategories = categoryData.filter(c => c && !c.disabled);

	if (initialCid) {
		const hasAccess = validCategories.some(c => c.cid === initialCid);
		if (!hasAccess) {
			return controllerHelpers.redirect(res, '/extra-tools/moderation-tools');
		}
	}

	const breadcrumb = [
		{
			text: '[[global:home]]',
			href: `${nconf.get('relative_path')}/`,
		},
		{
			text: '[[moderation-tools:page-title]]',
		},
	];

	res.render('moderation-tools', {
		title: '[[moderation-tools:page-title]]',
		breadcrumb: breadcrumb,
		categories: validCategories,
		initialCid: initialCid || (validCategories.length > 0 ? validCategories[0].cid : null),
		config: config,
		isAdmin: isAdmin,
		isGlobalMod: isGlobalMod,
		// Fix 1: Pass translated strings for client-side JS
		moderationToolsText: {
			save: saveText,
			saving: savingText,
			saveSuccess: saveSuccessText,
			unsavedChanges: unsavedChangesText,
			loadFailed: loadFailedText,
			saveFailed: saveFailedText,
		},
	});
};

/**
 * Render the ACP configuration page
 */
Plugin.renderAdminPage = async function (req, res) {
	const config = await Plugin.getConfig();

	res.render('admin/moderation-tools', {
		title: '[[moderation-tools:admin:title]]',
		allFields: Plugin.allFields,
		sidebarActions: Plugin.sidebarActions,
		enabledFields: config.enabledFields,
		enabledSidebarActions: config.enabledSidebarActions,
	});
};

/**
 * Add admin navigation menu item
 */
Plugin.addAdminNavigation = function (header, callback) {
	header.plugins.push({
		route: '/plugins/moderation-tools',
		icon: 'fa-wrench',
		name: '[[moderation-tools:admin:title]]',
	});

	callback(null, header);
};

/**
 * Inject moderation tool data into all rendered pages via filter:middleware.render
 */
Plugin.addMiddlewareData = async function (data) {
	const uid = data.req.uid;
	if (uid > 0) {
		const isAdmin = await user.isAdministrator(uid);
		const isGlobalMod = await user.isGlobalModerator(uid);
		const isModerator = isAdmin || isGlobalMod || await user.isModeratorOfAnyCategory(uid);

		if (isModerator) {
			data.templateData.moderationToolsUserCanModerate = true;
		}
	}

	return data;
};

/**
 * Add plugin script to page scripts via filter:scripts.get
 */
Plugin.addScripts = async function (scripts) {
	scripts.push('/plugins/nodebb-plugin-moderation-tools/static/js/moderation-tools.js');
	return scripts;
};

/**
 * Socket handler for saving ACP settings
 */
Plugin.socketSaveSettings = async function (socket, data) {
	if (!socket.uid || !await user.isAdministrator(socket.uid)) {
		throw new Error('[[error:no-privileges]]');
	}

	const enabledFields = data.enabledFields || Plugin.defaultConfig.enabledFields;
	const enabledSidebarActions = data.enabledSidebarActions || Plugin.defaultConfig.enabledSidebarActions;

	await meta.settings.set('moderation-tools', {
		enabledFields: JSON.stringify(enabledFields),
		enabledSidebarActions: JSON.stringify(enabledSidebarActions),
	});
};

/**
 * Define the widget
 */
Plugin.defineWidget = async function (widgets) {
	widgets.push({
		name: '[[moderation-tools:widget:name]]',
		widget: 'moderation-tools-link',
		description: '[[moderation-tools:widget:description]]',
		content: '<a href="{relative_path}/extra-tools/moderation-tools" class="btn btn-primary btn-block">[[moderation-tools:widget:label]]</a>',
	});

	return widgets;
};

/**
 * Render widget content (with permission check)
 */
Plugin.renderWidget = async function (data) {
	const uid = data.uid;

	if (!uid) {
		return data;
	}

	const userSettings = await user.getSettings(uid);
	const lang = userSettings.userLang || meta.config.defaultLang || 'en-GB';
	const t = new translator(lang);
	const label = await t.translate('[[moderation-tools:widget:label]]');

	const isAdmin = await user.isAdministrator(uid);
	const isGlobalMod = await user.isGlobalModerator(uid);

	let cid = null;
	if (data.templateData) {
		cid = data.templateData.cid || (data.templateData.category && data.templateData.category.cid);
	}

	if (isAdmin || isGlobalMod) {
		let href = `${nconf.get('relative_path')}/extra-tools/moderation-tools`;
		if (cid) {
			href += `?cid=${cid}`;
		}
		data.html = `<a href="${href}" class="btn btn-outline-primary btn-block">${label}</a>`;
		return data;
	}

	const isMod = await user.isModeratorOfAnyCategory(uid);
	if (!isMod) {
		data.html = '';
		return data;
	}

	if (cid) {
		const hasModPrivilege = await privileges.categories.isAdminOrMod(cid, uid);
		if (!hasModPrivilege) {
			data.html = '';
			return data;
		}
	}

	let href = `${nconf.get('relative_path')}/extra-tools/moderation-tools`;
	if (cid) {
		href += `?cid=${cid}`;
	}

	data.html = `<a href="${href}" class="btn btn-outline-primary btn-block">${label}</a>`;
	return data;
};

module.exports = Plugin;
