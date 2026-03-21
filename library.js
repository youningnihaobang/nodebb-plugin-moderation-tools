'use strict';

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const user = require.main.require('./src/user');
const categories = require.main.require('./src/categories');
const privileges = require.main.require('./src/privileges');
const meta = require.main.require('./src/meta');
const plugins = require.main.require('./src/plugins');
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

// Built-in field definitions with metadata (used by getFields)
Plugin.builtinFieldDefs = [
	{ key: 'name', label: 'moderation-tools:fields.name', type: 'text', group: 'core', description: 'moderation-tools:fields.name.desc', order: 1 },
	{ key: 'handle', label: 'moderation-tools:fields.handle', type: 'text', group: 'core', description: 'moderation-tools:fields.handle.desc', order: 2 },
	{ key: 'description', label: 'moderation-tools:fields.description', type: 'textarea', group: 'core', description: 'moderation-tools:fields.description.desc', order: 3 },
	{ key: 'topicTemplate', label: 'moderation-tools:fields.topicTemplate', type: 'textarea', group: 'core', description: 'moderation-tools:fields.topicTemplate.desc', order: 4 },
	{ key: 'parentCid', label: 'moderation-tools:fields.parentCid', type: 'number', group: 'core', description: 'moderation-tools:fields.parentCid.desc', order: 5 },
	{ key: 'numRecentReplies', label: 'moderation-tools:fields.numRecentReplies', type: 'number', group: 'core', description: 'moderation-tools:fields.numRecentReplies.desc', order: 6 },
	{ key: 'subCategoriesPerPage', label: 'moderation-tools:fields.subCategoriesPerPage', type: 'number', group: 'core', description: 'moderation-tools:fields.subCategoriesPerPage.desc', order: 7 },
	{ key: 'minTags', label: 'moderation-tools:fields.minTags', type: 'number', group: 'core', description: 'moderation-tools:fields.minTags.desc', order: 8 },
	{ key: 'maxTags', label: 'moderation-tools:fields.maxTags', type: 'number', group: 'core', description: 'moderation-tools:fields.maxTags.desc', order: 9 },
	{ key: 'tagWhitelist', label: 'moderation-tools:fields.tagWhitelist', type: 'text', group: 'core', description: 'moderation-tools:fields.tagWhitelist.desc', order: 10 },
	{ key: 'link', label: 'moderation-tools:fields.link', type: 'text', group: 'core', description: 'moderation-tools:fields.link.desc', order: 11 },
	{ key: 'isSection', label: 'moderation-tools:fields.isSection', type: 'boolean', group: 'core', description: 'moderation-tools:fields.isSection.desc', order: 12 },
	{ key: 'postQueue', label: 'moderation-tools:fields.postQueue', type: 'boolean', group: 'core', description: 'moderation-tools:fields.postQueue.desc', order: 13 },
	{ key: 'backgroundImage', label: 'moderation-tools:fields.backgroundImage', type: 'text', group: 'core', description: 'moderation-tools:fields.backgroundImage.desc', order: 14 },
	{ key: 'bgColor', label: 'moderation-tools:fields.bgColor', type: 'color', group: 'core', description: 'moderation-tools:fields.bgColor.desc', order: 15 },
	{ key: 'color', label: 'moderation-tools:fields.color', type: 'color', group: 'core', description: 'moderation-tools:fields.color.desc', order: 16 },
	{ key: 'imageClass', label: 'moderation-tools:fields.imageClass', type: 'select', group: 'core', description: 'moderation-tools:fields.imageClass.desc', order: 17 },
	{ key: 'class', label: 'moderation-tools:fields.class', type: 'text', group: 'core', description: 'moderation-tools:fields.class.desc', order: 18 },
];

// Cache for getFields() results
Plugin._fieldsCache = null;

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

/**
 * Get all field definitions (built-in + extension fields from other plugins).
 * Fires filter:moderation-tools.fields hook to let other plugins register custom fields.
 * Results are cached; call resetFieldsCache() to invalidate.
 * @returns {Promise<Array>} sorted array of field definitions
 */
Plugin.getFields = async function () {
	if (Plugin._fieldsCache) {
		return Plugin._fieldsCache;
	}

	// Start with built-in field definitions (shallow copy)
	const fields = Plugin.builtinFieldDefs.map(function (f) {
		return Object.assign({}, f, { isExtension: false });
	});

	// Fire filter hook to let other plugins add/modify field definitions
	let result = { fields: fields };
	result = await plugins.hooks.fire('filter:moderation-tools.fields', result);

	// Mark any fields not in the built-in list as extensions
	const builtinKeys = new Set(Plugin.allFields);
	for (const field of result.fields) {
		if (!builtinKeys.has(field.key)) {
			field.isExtension = true;
		}
	}

	// Blocklist of NodeBB internal category properties that extension fields must not collide with
	const reservedKeys = new Set([
		'cid', 'disabled', 'slug', 'order', 'icon', 'descriptionParsed',
		'parentCid', 'name', 'key', 'lagacy', 'post_count', 'topic_count',
		'totalPostCount', 'totalTopicCount', 'recentPosts',
	]);
	result.fields = result.fields.filter(function (field) {
		if (field.isExtension && reservedKeys.has(field.key)) {
			winston.warn('[plugins/moderation-tools] Extension field "' + field.key + '" uses a reserved key and has been ignored.');
			return false;
		}
		return true;
	});

	// Sort by order property (ascending), extensions without order go last
	result.fields.sort(function (a, b) {
		const orderA = a.order !== undefined ? a.order : Infinity;
		const orderB = b.order !== undefined ? b.order : Infinity;
		return orderA - orderB;
	});

	Plugin._fieldsCache = result.fields;
	return Plugin._fieldsCache;
};

/**
 * Reset the fields cache so the next getFields() call re-fires the hook.
 * Should be called when extension plugins are installed/uninstalled.
 */
Plugin.resetFieldsCache = function () {
	Plugin._fieldsCache = null;
};

// Default configuration (nested, used by getConfig for runtime)
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

// Flat defaults for meta.settings (used by filter:settings.get hook)
// Stored as 'on'/'off' strings, matching the standard settings module convention
Plugin.settingsDefaults = {};
for (const field of Plugin.allFields) {
	Plugin.settingsDefaults[`enabledFields_${field}`] = Plugin.defaultConfig.enabledFields[field] ? 'on' : 'off';
}
for (const action of Plugin.sidebarActions) {
	Plugin.settingsDefaults[`enabledSidebarActions_${action}`] = Plugin.defaultConfig.enabledSidebarActions[action] ? 'on' : 'off';
}

/**
 * Get plugin configuration from meta.settings
 * Settings are stored in flat format (e.g., enabledFields_name, enabledSidebarActions_viewCategory)
 * This function reconstructs the nested structure from flat keys.
 */
Plugin.getConfig = async function () {
	const settings = await meta.settings.get('moderation-tools');
	const config = JSON.parse(JSON.stringify(Plugin.defaultConfig));

	// Get all fields (built-in + extension) to handle extension field keys
	const allFieldDefs = await Plugin.getFields();

	if (settings) {
		// Reconstruct enabledFields from flat keys like "enabledFields_name"
		// Include both built-in and extension fields
		for (const fieldDef of allFieldDefs) {
			const key = `enabledFields_${fieldDef.key}`;
			if (settings.hasOwnProperty(key)) {
				config.enabledFields[fieldDef.key] = settings[key] === 'on' || settings[key] === true;
			}
		}

		// Reconstruct enabledSidebarActions from flat keys like "enabledSidebarActions_viewCategory"
		for (const action of Plugin.sidebarActions) {
			const key = `enabledSidebarActions_${action}`;
			if (settings.hasOwnProperty(key)) {
				config.enabledSidebarActions[action] = settings[key] === 'on' || settings[key] === true;
			}
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
 * Escape a string for safe insertion into HTML.
 * Prevents XSS when building HTML strings in widget rendering.
 * @param {string} str
 * @returns {string}
 */
Plugin.escapeHtml = function (str) {
	if (typeof str !== 'string') {
		return '';
	}
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

/**
 * Validate CSS class names (alphanumeric, hyphens, underscores, spaces only)
 * @param {string} classStr
 * @returns {boolean}
 */
Plugin.isValidCssClass = function (classStr) {
	if (!classStr || typeof classStr !== 'string') {
		return true; // empty is ok
	}
	return /^[\w\s-]+$/.test(classStr);
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

			// Get all field definitions (built-in + extension)
			const allFieldDefs = await Plugin.getFields();

			// Filter to only return enabled fields
			const filteredData = {};
			for (const fieldDef of allFieldDefs) {
				if (enabledFields[fieldDef.key]) {
					filteredData[fieldDef.key] = categoryData[fieldDef.key] !== undefined ? categoryData[fieldDef.key] : '';
				}
			}
			filteredData.cid = cid;
			filteredData.name = categoryData.name; // Always include name for display
			filteredData.icon = categoryData.icon; // Always include icon for display

			// Fire filter hook to let other plugins modify loaded category data
			let hookPayload = { data: filteredData, cid: cid, uid: uid };
			hookPayload = await plugins.hooks.fire('filter:moderation-tools.category.load', hookPayload);

			const extensionFields = allFieldDefs.filter(function (f) { return f.isExtension; });
			helpers.formatApiResponse(200, res, {
				category: hookPayload.data,
				config: {
					enabledFields: enabledFields,
					enabledSidebarActions: config.enabledSidebarActions,
					extensionFields: extensionFields,
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

			// Get all field definitions (built-in + extension)
			const allFieldDefs = await Plugin.getFields();
			const builtinKeys = new Set(Plugin.allFields);

			// Filter submitted data to only include enabled fields
			const updateData = {};
			const extensionData = {};
			for (const fieldDef of allFieldDefs) {
				if (enabledFields[fieldDef.key] && req.body.hasOwnProperty(fieldDef.key)) {
					if (builtinKeys.has(fieldDef.key)) {
						updateData[fieldDef.key] = req.body[fieldDef.key];
					} else {
						// Extension fields: collect separately, don't pass to categories.update
						extensionData[fieldDef.key] = req.body[fieldDef.key];
					}
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

			// Fix 10: parentCid existence and self-reference validation
			if (updateData.hasOwnProperty('parentCid') && updateData.parentCid > 0) {
				// Security: prevent circular self-reference
				if (parseInt(updateData.parentCid, 10) === cid) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, parentCid cannot reference itself]]'));
				}
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

			// Fix 12: minTags should not exceed maxTags (cross-validate against existing values too)
			if (updateData.hasOwnProperty('minTags') || updateData.hasOwnProperty('maxTags')) {
				const effectiveMin = updateData.hasOwnProperty('minTags') ? updateData.minTags : (parseInt(existingCategory.minTags, 10) || 0);
				const effectiveMax = updateData.hasOwnProperty('maxTags') ? updateData.maxTags : (parseInt(existingCategory.maxTags, 10) || 0);
				if (effectiveMax > 0 && effectiveMin > effectiveMax) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, minTags must not exceed maxTags]]'));
				}
			}

			// Fix 11: Validate link field as valid URL
			if (updateData.hasOwnProperty('link')) {
				if (!Plugin.isValidUrl(updateData.link)) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, link must be a valid URL]]'));
				}
			}

			// Security: Validate backgroundImage as valid URL (prevent javascript: / data: URI injection)
			if (updateData.hasOwnProperty('backgroundImage')) {
				if (!Plugin.isValidUrl(updateData.backgroundImage)) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, backgroundImage must be a valid URL]]'));
				}
			}

			// Security: Validate class field to prevent CSS injection
			if (updateData.hasOwnProperty('class')) {
				if (!Plugin.isValidCssClass(updateData.class)) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, class must contain only alphanumeric characters, spaces, hyphens, and underscores]]'));
				}
			}

			// Security: Whitelist-validate imageClass to prevent arbitrary value injection
			if (updateData.hasOwnProperty('imageClass')) {
				const validImageClasses = ['auto', 'cover', 'contain'];
				if (updateData.imageClass && !validImageClasses.includes(updateData.imageClass)) {
					return helpers.formatApiResponse(400, res, new Error('[[error:invalid-data, imageClass must be one of: auto, cover, contain]]'));
				}
			}

			// Save using NodeBB's built-in categories.update
			const updatedKeys = Object.keys(updateData);
			if (updatedKeys.length === 0 && Object.keys(extensionData).length === 0) {
				return helpers.formatApiResponse(200, res, { cid: cid, updated: [] });
			}

			if (updatedKeys.length > 0) {
				await categories.update({ [cid]: updateData });
			}

			// Fire action hook after successful save (includes both built-in and extension data)
			await plugins.hooks.fire('action:moderation-tools.category.save', {
				data: Object.assign({}, updateData, extensionData),
				cid: cid,
				uid: uid,
			});

			helpers.formatApiResponse(200, res, { cid: cid, updated: updatedKeys.concat(Object.keys(extensionData)) });
		} catch (err) {
			helpers.formatApiResponse(500, res, Plugin.safeApiError(err));
		}
	});

	// Get plugin config - requires admin or moderator privileges
	routeHelpers.setupApiRoute(router, 'get', '/extra-tools/moderation-tools/config', apiMiddleware, async (req, res) => {
		try {
			const uid = req.uid;
			const isAdmin = await user.isAdministrator(uid);
			const isGlobalMod = await user.isGlobalModerator(uid);
			const isModerator = isAdmin || isGlobalMod || await user.isModeratorOfAnyCategory(uid);

			if (!isAdmin && !isGlobalMod) {
				return helpers.formatApiResponse(403, res, new Error('[[error:no-privileges]]'));
			}

			const config = await Plugin.getConfig();
			const allFieldDefs = await Plugin.getFields();
			helpers.formatApiResponse(200, res, {
				enabledFields: config.enabledFields,
				enabledSidebarActions: config.enabledSidebarActions,
				fields: allFieldDefs,
			});
		} catch (err) {
			helpers.formatApiResponse(500, res, Plugin.safeApiError(err));
		}
	});
};

/**
 * Render the frontend moderation tools page
 */
Plugin.renderModerationPage = async function (req, res, next) {
	try {
	const uid = req.uid;

	// Check if user has any moderation privileges (parallelize independent queries)
	const [isAdmin, isGlobalMod] = await Promise.all([
		user.isAdministrator(uid),
		user.isGlobalModerator(uid),
	]);

	if (!isAdmin && !isGlobalMod) {
		const isMod = await user.isModeratorOfAnyCategory(uid);
		if (!isMod) {
			return controllerHelpers.redirect(res, '/');
		}
	}

	// Parallelize independent data fetches
	const [pluginConfig, userSettings, allFieldDefs] = await Promise.all([
		Plugin.getConfig(),
		user.getSettings(uid),
		Plugin.getFields(),
	]);
	const config = pluginConfig;
	const extensionFields = allFieldDefs.filter(function (f) { return f.isExtension; });

	// Translate strings for JS use and pass via ajaxify.data
	const userLang = userSettings.userLang || meta.config.defaultLang || 'en-GB';
	const [saveText, savingText, saveSuccessText, unsavedChangesText, loadFailedText, saveFailedText] = await Promise.all([
		translator.translate('[[moderation-tools:save]]', userLang),
		translator.translate('[[moderation-tools:saving]]', userLang),
		translator.translate('[[moderation-tools:save-success]]', userLang),
		translator.translate('[[moderation-tools:unsaved-changes]]', userLang),
		translator.translate('[[moderation-tools:load-failed]]', userLang),
		translator.translate('[[moderation-tools:save-failed]]', userLang),
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

	// Add 'selected' flag for Benchpress template conditional
	validCategories.forEach(function (category) {
		category.selected = (category.cid === initialCid);
	});

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
		config: Object.assign({}, config, { extensionFields: extensionFields }),
		isAdmin: isAdmin,
		isGlobalMod: isGlobalMod,
		// Pass translated strings for client-side JS
		moderationToolsText: {
			save: saveText,
			saving: savingText,
			saveSuccess: saveSuccessText,
			unsavedChanges: unsavedChangesText,
			loadFailed: loadFailedText,
			saveFailed: saveFailedText,
		},
	});
	} catch (err) {
		winston.error('[plugins/moderation-tools] renderModerationPage error: ' + (err.stack || err.message));
		return next(err);
	}
};

/**
 * Render the ACP configuration page
 * Settings are loaded client-side via settings.load(), following the standard NodeBB pattern.
 */
Plugin.renderAdminPage = async function (req, res, next) {
	try {
		const allFieldDefs = await Plugin.getFields();

		// Translate field labels and descriptions for ACP display
		const userSettings = await user.getSettings(req.uid);
		const userLang = userSettings.userLang || meta.config.defaultLang || 'en-GB';
		const translatedFields = await Promise.all(allFieldDefs.map(async function (field) {
			const translated = Object.assign({}, field);
			if (translated.label) {
				translated.label = await translator.translate('[[' + translated.label + ']]', userLang);
			}
			if (translated.description) {
				translated.description = await translator.translate('[[' + translated.description + ']]', userLang);
			}
			return translated;
		}));

		res.render('admin/plugins/moderation-tools', {
		title: '[[moderation-tools:admin.title]]',
		allFields: translatedFields,
		sidebarActions: Plugin.sidebarActions.map(function (action) {
			return { name: action };
		}),
	});
	} catch (err) {
		winston.error('[plugins/moderation-tools] renderAdminPage error: ' + (err.stack || err.message));
		return next(err);
	}
};

/**
 * Add admin navigation menu item
 */
Plugin.addAdminNavigation = async function (header) {
	header.plugins.push({
		route: '/plugins/moderation-tools',
		icon: 'fa-wrench',
		name: '[[moderation-tools:admin.title]]',
	});

	return header;
};

/**
 * Merge default settings into values returned by meta.settings.get
 * Ensures new installations have correct default values ('on'/'off')
 */
Plugin.getAdminSettings = async function (hookData) {
	winston.verbose('[moderation-tools] getAdminSettings hook fired, plugin: ' + hookData.plugin);
	if (hookData.plugin === 'moderation-tools') {
		winston.verbose('[moderation-tools] getAdminSettings incoming values: ' + JSON.stringify(hookData.values));
		winston.verbose('[moderation-tools] getAdminSettings defaults: ' + JSON.stringify(Plugin.settingsDefaults));
		hookData.values = {
			...Plugin.settingsDefaults,
			...hookData.values,
		};
		winston.verbose('[moderation-tools] getAdminSettings merged values: ' + JSON.stringify(hookData.values));
	}
	return hookData;
};

/**
 * Inject moderation tool data into all rendered pages via filter:middleware.render
 */
Plugin.addMiddlewareData = async function (data) {
	try {
		const uid = data.req.uid;
		if (uid > 0) {
			const [isAdmin, isGlobalMod] = await Promise.all([
				user.isAdministrator(uid),
				user.isGlobalModerator(uid),
			]);
			const isModerator = isAdmin || isGlobalMod || await user.isModeratorOfAnyCategory(uid);

			if (isModerator) {
				data.templateData.moderationToolsUserCanModerate = true;
			}
		}
	} catch (err) {
		winston.warn('[plugins/moderation-tools] addMiddlewareData error: ' + (err.message || err));
	}

	return data;
};

/**
 * Define the widget
 */
Plugin.defineWidget = async function (widgets) {
	widgets.push({
		name: '[[moderation-tools:widget.name]]',
		widget: 'moderation-tools-link',
		description: '[[moderation-tools:widget.description]]',
		content: '<a href="{relative_path}/extra-tools/moderation-tools" class="btn btn-primary btn-block">[[moderation-tools:widget.label]]</a>',
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
	const label = await translator.translate('[[moderation-tools:widget.label]]', lang);

	const isAdmin = await user.isAdministrator(uid);
	const isGlobalMod = await user.isGlobalModerator(uid);

	let cid = null;
	if (data.templateData) {
		cid = data.templateData.cid || (data.templateData.category && data.templateData.category.cid);
	}
	// Security: ensure cid is numeric to prevent XSS via template data injection
	if (cid) {
		cid = parseInt(cid, 10);
		if (isNaN(cid) || cid <= 0) {
			cid = null;
		}
	}

	// Security: HTML-encode label to prevent XSS from translation strings
	const safeLabel = Plugin.escapeHtml(label);

	if (isAdmin || isGlobalMod) {
		let href = `${nconf.get('relative_path')}/extra-tools/moderation-tools`;
		if (cid) {
			href += `?cid=${cid}`;
		}
		data.html = `<a href="${href}" class="btn btn-outline-primary btn-block">${safeLabel}</a>`;
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

	data.html = `<a href="${href}" class="btn btn-outline-primary btn-block">${safeLabel}</a>`;
	return data;
};

module.exports = Plugin;
