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
 * Initialize plugin - register routes
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
			helpers.formatApiResponse(500, res, new Error(err.message));
		}
	});

	// Get category data for editing (only authorized fields)
	routeHelpers.setupApiRoute(router, 'get', '/extra-tools/moderation-tools/category/:cid', apiMiddleware, async (req, res) => {
		try {
			const cid = parseInt(req.params.cid, 10);
			const uid = req.uid;

			// Verify user has moderate privilege for this category
			const hasPrivilege = await privileges.categories.isAdminOrMod(cid, uid);
			if (!hasPrivilege) {
				return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
			}

			// Get full category data
			const categoryData = await categories.getCategoryData(cid);
			if (!categoryData) {
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

			// Also return config info
			helpers.formatApiResponse(200, res, {
				category: filteredData,
				config: {
					enabledFields: enabledFields,
					enabledSidebarActions: config.enabledSidebarActions,
				},
			});
		} catch (err) {
			helpers.formatApiResponse(500, res, new Error(err.message));
		}
	});

	// Save category data (only authorized fields)
	routeHelpers.setupApiRoute(router, 'put', '/extra-tools/moderation-tools/category/:cid', apiMiddleware, async (req, res) => {
		try {
			const cid = parseInt(req.params.cid, 10);
			const uid = req.uid;

			// Verify user has moderate privilege for this category
			const hasPrivilege = await privileges.categories.isAdminOrMod(cid, uid);
			if (!hasPrivilege) {
				return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
			}

			// Verify category exists
			const exists = await categories.exists(cid);
			if (!exists) {
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
			if (enabledFields.name && (!updateData.name || !updateData.name.toString().trim())) {
				return helpers.formatApiResponse(400, res, new Error('[[error:category-name-required]]'));
			}

			// Handle boolean fields
			const boolFields = ['isSection', 'postQueue'];
			for (const field of boolFields) {
				if (updateData.hasOwnProperty(field)) {
					updateData[field] = updateData[field] ? 1 : 0;
				}
			}

			// Handle numeric fields
			const numFields = ['numRecentReplies', 'subCategoriesPerPage', 'minTags', 'maxTags', 'parentCid'];
			for (const field of numFields) {
				if (updateData.hasOwnProperty(field)) {
					updateData[field] = parseInt(updateData[field], 10) || 0;
				}
			}

			// Save using NodeBB's built-in categories.update
			await categories.update({ [cid]: updateData });

			helpers.formatApiResponse(200, res, { cid: cid, updated: Object.keys(updateData) });
		} catch (err) {
			helpers.formatApiResponse(500, res, new Error(err.message));
		}
	});

	// Get plugin config (for frontend use)
	routeHelpers.setupApiRoute(router, 'get', '/extra-tools/moderation-tools/config', apiMiddleware, async (req, res) => {
		try {
			const config = await Plugin.getConfig();
			helpers.formatApiResponse(200, res, config);
		} catch (err) {
			helpers.formatApiResponse(500, res, new Error(err.message));
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
		// Check if user is moderator of any category
		const isMod = await user.isModeratorOfAnyCategory(uid);
		if (!isMod) {
			return controllerHelpers.redirect(res, '/');
		}
	}

	// Get config
	const config = await Plugin.getConfig();

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
		// Verify the user has access to the requested category
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

	// Determine the user's language for translation
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

	// Check if user is moderator of any category
	const isMod = await user.isModeratorOfAnyCategory(uid);
	if (!isMod) {
		data.html = '';
		return data;
	}

	// For regular moderators, show widget only if they have moderate privilege for the current category
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
