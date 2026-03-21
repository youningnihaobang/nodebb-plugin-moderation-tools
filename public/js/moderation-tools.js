/**
 * Moderation Tools - Frontend client module
 *
 * Loaded on all pages via filter:scripts.get hook.
 * Only initializes when the current page is /extra-tools/moderation-tools.
 * Uses action:ajaxify.end for ajax navigation support.
 *
 * Uses ajaxify.data.moderationToolsText (pre-translated by server)
 * as fallback; also uses client-side translator module for robustness.
 */
/* global ajaxify, config */
define('moderation-tools', ['jquery', 'translator', 'alerts'], function ($, translator, alerts) {
	'use strict';

	var ModerationTools = {};

	/**
	 * Safely parse JSON from a response, returning a fallback on failure.
	 * Prevents SyntaxError when server returns non-JSON error pages.
	 * Extracts message from NodeBB's formatApiResponse error structure:
	 * { status: { code, message }, response: {} }
	 */
	async function safeParseJson(response, fallbackMsg) {
		try {
			var json = await response.json();
			// NodeBB formatApiResponse puts error message in status.message
			var message = (json.status && json.status.message) || json.message || fallbackMsg;
			return { message: message };
		} catch (e) {
			return { message: fallbackMsg || 'An unexpected error occurred.' };
		}
	}

	/**
	 * Escape a string for safe insertion into HTML attribute context.
	 * @param {string} str
	 * @returns {string}
	 */
	function escapeHtmlAttr(str) {
		if (typeof str !== 'string') {
			return '';
		}
		return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	/**
	 * Escape a string for safe insertion into HTML text content.
	 * @param {string} str
	 * @returns {string}
	 */
	function escapeHtmlText(str) {
		if (typeof str !== 'string') {
			return '';
		}
		return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	/**
	 * Translate an i18n key or return the raw string if it's not a key.
	 * Supports both [[namespace:key]] and plain text labels.
	 * @param {string} keyOrText - i18n key like [[moderation-tools:fields.foo]] or plain text
	 * @returns {Promise<string>}
	 */
	function translateFieldText(keyOrText) {
		if (!keyOrText || typeof keyOrText !== 'string') {
			return Promise.resolve('');
		}
		// Check if it looks like an i18n key: [[namespace:key]]
		var match = keyOrText.match(/^\[\[([\w-]+):([\w-./]+)\]\]$/);
		if (match) {
			var lang = (config && config.userLang) || 'en-GB';
			return translator.translate(keyOrText, lang).then(function (translated) {
				// Return the translated string; if unchanged, the raw key is fine
				return translated || keyOrText;
			});
		}
		return Promise.resolve(keyOrText);
	}

	/**
	 * Initialize the moderation tools page
	 */
	ModerationTools.init = function () {
		// Guard: only initialize when on the correct page
		if (!document.getElementById('moderation-tools')) {
			return;
		}

		var $saveBtn = $('#moderation-tools-save');
		var $cidSelect = $('#moderation-tools-cid-select');
		var $form = $('#moderation-tools-form');
		var $loading = $('#moderation-tools-loading');
		var $formContainer = $('#moderation-tools-form-container');
		var $content = $('#moderation-tools-content');
		var $empty = $('#moderation-tools-empty');
		var $extensionFields = $('#moderation-tools-extension-fields');

		var currentCid = parseInt($cidSelect.val(), 10) || null;
		var originalData = {};
		var isSaving = false;
		var hasChanges = false;

		// Get pre-translated strings from server, with client-side translator fallback
		var text = (ajaxify.data && ajaxify.data.moderationToolsText) || {};
		var pendingTranslations = {};

		// Ensure we have all needed translated strings
		function ensureText(key, fallbackKey) {
			if (text[key]) {
				return Promise.resolve(text[key]);
			}
			// Fallback to client-side translator
			if (pendingTranslations[key]) {
				return pendingTranslations[key];
			}
			var lang = (config && config.userLang) || 'en-GB';
			pendingTranslations[key] = translator.translate('[[moderation-tools:' + fallbackKey + ']]', lang);
			return pendingTranslations[key].then(function (translated) {
				text[key] = translated || fallbackKey;
				return text[key];
			});
		}

		// Initialize enabled fields visibility based on config passed from server
		function initFieldVisibility() {
			if (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.config) {
				var enabledFields = ajaxify.data.config.enabledFields || {};
				$('.moderation-tools-field').each(function () {
					var field = $(this).data('field');
					if (!enabledFields[field]) {
						$(this).addClass('hidden');
					} else {
						$(this).removeClass('hidden');
					}
				});
				// Handle tags group
				var tagsGroupVisible = enabledFields.minTags || enabledFields.maxTags;
				if (tagsGroupVisible) {
					$('[data-field-group="tags"]').removeClass('hidden');
					$('.mt-min-tags-field').toggleClass('hidden', !enabledFields.minTags);
					$('.mt-max-tags-field').toggleClass('hidden', !enabledFields.maxTags);
				} else {
					$('[data-field-group="tags"]').addClass('hidden');
				}
			}
		}

		// --- Extension Fields ---

		/**
		 * Get extension field definitions from config.
		 * These are populated by the server-side hook system via ajaxify.data.config.extensionFields
		 * @returns {Array} Array of FieldDefinition objects
		 */
		function getExtensionFieldDefs() {
			if (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.config) {
				return ajaxify.data.config.extensionFields || [];
			}
			return [];
		}

		/**
		 * Get enabled extension field definitions (filtered by enabledFields).
		 * @returns {Array}
		 */
		function getEnabledExtensionFieldDefs() {
			var allDefs = getExtensionFieldDefs();
			var enabledFields = {};
			if (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.config) {
				enabledFields = ajaxify.data.config.enabledFields || {};
			}
			return allDefs.filter(function (field) {
				return enabledFields[field.key];
			});
		}

		/**
		 * Build HTML for a single extension field based on its type.
		 * @param {object} field - FieldDefinition object
		 * @param {string} fieldId - Unique DOM id for the input element
		 * @returns {Promise<string>} HTML string
		 */
		async function buildExtensionFieldHtml(field, fieldId) {
			var label = await translateFieldText(field.label);
			var description = await translateFieldText(field.description || '');
			var placeholder = await translateFieldText(field.placeholder || '');
			var key = escapeHtmlAttr(field.key);

			var inputHtml = '';

			switch (field.type) {
				case 'text':
					inputHtml = '<input id="' + fieldId + '" type="text" class="form-control" data-name="' + key + '"'
						+ (placeholder ? ' placeholder="' + escapeHtmlAttr(placeholder) + '"' : '')
						+ ' />';
					break;

				case 'textarea':
					inputHtml = '<textarea id="' + fieldId + '" data-name="' + key + '" class="form-control" rows="4"'
						+ (placeholder ? ' placeholder="' + escapeHtmlAttr(placeholder) + '"' : '')
						+ '></textarea>';
					break;

				case 'number':
					var min = (field.options && field.options.min !== undefined) ? field.options.min : '';
					var max = (field.options && field.options.max !== undefined) ? field.options.max : '';
					var step = (field.options && field.options.step) ? field.options.step : '';
					inputHtml = '<input id="' + fieldId + '" type="number" class="form-control" data-name="' + key + '"'
						+ (min !== '' ? ' min="' + min + '"' : '')
						+ (max !== '' ? ' max="' + max + '"' : '')
						+ (step ? ' step="' + step + '"' : '')
						+ (placeholder ? ' placeholder="' + escapeHtmlAttr(placeholder) + '"' : '')
						+ ' style="max-width: 200px;" />';
					break;

				case 'checkbox':
					inputHtml = '<div class="form-check form-switch">'
						+ '<input type="checkbox" class="form-check-input" id="' + fieldId + '" data-name="' + key + '" />'
						+ '<label for="' + fieldId + '" class="form-check-label">' + escapeHtmlText(label) + '</label>'
						+ '</div>';
					break;

				case 'select':
					var opts = field.options || [];
					var optHtml = '';
					// If options is an array of strings, use them directly; if objects, use .value/.label
					if (opts.length > 0 && typeof opts[0] === 'string') {
						optHtml = opts.map(function (opt) {
							return '<option value="' + escapeHtmlAttr(opt) + '">' + escapeHtmlText(opt) + '</option>';
						}).join('');
					} else if (opts.length > 0 && typeof opts[0] === 'object') {
						optHtml = opts.map(function (opt) {
							return '<option value="' + escapeHtmlAttr(opt.value) + '">' + escapeHtmlText(opt.label || opt.value) + '</option>';
						}).join('');
					}
					inputHtml = '<select id="' + fieldId + '" data-name="' + key + '" class="form-select w-auto">'
						+ optHtml + '</select>';
					break;

				case 'color':
					// Same pattern as existing bgColor/color fields: text input + color swatch
					inputHtml = '<div class="d-flex gap-2 align-items-center" style="max-width: 200px;">'
						+ '<input type="text" id="' + fieldId + '" data-name="' + key + '" class="form-control" placeholder="#ffffff" />'
						+ '<input type="color" class="form-control form-control-color p-1 mt-color-preview" style="min-width: 40px; height: 38px;" data-target="' + fieldId + '" />'
						+ '</div>';
					break;

				case 'custom':
					// Placeholder for custom template - will be loaded after render
					inputHtml = '<div id="' + fieldId + '-custom" data-name="' + key + '" class="mt-custom-field"'
						+ (field.template ? ' data-template="' + escapeHtmlAttr(field.template) + '"' : '')
						+ '>'
						+ '<span class="text-muted"><i class="fa fa-spinner fa-spin me-1"></i> Loading...</span>'
						+ '</div>';
					break;

				default:
					// Fallback to text input for unknown types
					inputHtml = '<input id="' + fieldId + '" type="text" class="form-control" data-name="' + key + '"'
						+ (placeholder ? ' placeholder="' + escapeHtmlAttr(placeholder) + '"' : '')
						+ ' />';
					break;
			}

			// Build the wrapper
			var html = '<div class="mb-3 moderation-tools-field moderation-tools-extension-field" data-field="' + key + '"'
				+ (field.type === 'custom' ? ' data-template="' + escapeHtmlAttr(field.template || '') + '"' : '')
				+ (field.validator ? ' data-validator="' + escapeHtmlAttr(field.validator) + '"' : '')
				+ (field.onSave ? ' data-onsave="' + escapeHtmlAttr(field.onSave) + '"' : '')
				+ '>';

			// Label (not for checkbox, which includes its own label)
			if (field.type !== 'checkbox') {
				html += '<label class="form-label" for="' + fieldId + '">' + escapeHtmlText(label) + '</label>';
			}

			html += inputHtml;

			// Description
			if (description && field.type !== 'checkbox') {
				html += '<p class="form-text">' + escapeHtmlText(description) + '</p>';
			}

			html += '</div>';
			return html;
		}

		/**
		 * Render all extension fields grouped by their `group` property.
		 * Clears existing extension fields and rebuilds.
		 */
		async function renderExtensionFields() {
			var fields = getEnabledExtensionFieldDefs();
			$extensionFields.empty();

			if (fields.length === 0) {
				return;
			}

			// Group fields by their `group` property, preserving order of first appearance
			var groupOrder = [];
			var groups = {};
			fields.forEach(function (field) {
				var groupName = field.group || '';
				if (groups[groupName] === undefined) {
					groups[groupName] = [];
					groupOrder.push(groupName);
				}
				groups[groupName].push(field);
			});

			// Sort fields within each group by `order` (ascending), then by original array order
			groupOrder.forEach(function (groupName) {
				groups[groupName].sort(function (a, b) {
					var orderA = (typeof a.order === 'number') ? a.order : 999;
					var orderB = (typeof b.order === 'number') ? b.order : 999;
					return orderA - orderB;
				});
			});

			// Build HTML: separator, then group by group
			var html = '<hr class="mt-extension-separator" />';
			html += '<h6 class="moderation-tools-group-header fw-bold text-muted text-uppercase mb-3">'
				+ '<i class="fa fa-puzzle-piece me-1"></i> [[moderation-tools:group.extensions]]'
				+ '</h6>';

			for (var g = 0; g < groupOrder.length; g++) {
				var groupName = groupOrder[g];
				var groupFields = groups[groupName];

				// If multiple groups, render a sub-header for each named group
				if (groupOrder.length > 1 && groupName) {
					var translatedGroup = await translateFieldText(groupName);
					html += '<h6 class="moderation-tools-subgroup-header fw-semibold text-secondary mb-2 mt-3">'
						+ '<i class="fa fa-folder me-1"></i> ' + escapeHtmlText(translatedGroup)
						+ '</h6>';
				}

				for (var i = 0; i < groupFields.length; i++) {
					var field = groupFields[i];
					var fieldId = 'mt-ext-' + field.key;
					var fieldHtml = await buildExtensionFieldHtml(field, fieldId);
					html += fieldHtml;
				}
			}

			$extensionFields.html(html);

			// Load custom field templates asynchronously
			$extensionFields.find('.mt-custom-field[data-template]').each(function () {
				loadCustomTemplate($(this));
			});
		}

		/**
		 * Load a custom template for an extension field via ajax.
		 * @param {jQuery} $el - The custom field container element
		 */
		function loadCustomTemplate($el) {
			var templatePath = $el.data('template');
			if (!templatePath) {
				$el.html('<span class="text-danger">Custom template path not specified.</span>');
				return;
			}

			fetch(config.relative_path + '/api/' + templatePath, {
				credentials: 'same-origin',
				headers: { 'Accept': 'application/json' },
			}).then(function (response) {
				if (!response.ok) {
					throw new Error('Failed to load template');
				}
				return response.json();
			}).then(function (data) {
				// The API may return the template HTML in various ways
				// Try common patterns: data.response, data.html, data.template
				var templateHtml = '';
				if (data.response && typeof data.response === 'string') {
					templateHtml = data.response;
				} else if (data.response && data.response.html) {
					templateHtml = data.response.html;
				} else if (data.html) {
					templateHtml = data.html;
				} else if (data.template) {
					templateHtml = data.template;
				}
				$el.html(templateHtml || '<span class="text-muted">No template content.</span>');
			}).catch(function () {
				$el.html('<span class="text-danger">Failed to load custom template.</span>');
			});
		}

		// --- Extension field visibility control ---

		/**
		 * Update extension field visibility based on enabledFields config.
		 * Called after loading category data (which may update enabledFields).
		 */
		function updateExtensionFieldVisibility(enabledFields) {
			$('.moderation-tools-extension-field').each(function () {
				var field = $(this).data('field');
				if (enabledFields[field]) {
					$(this).removeClass('hidden');
				} else {
					$(this).addClass('hidden');
				}
			});
		}

		// --- Extension field validation ---

		/**
		 * Validate extension fields that have a `validator` callback.
		 * The validator is a global function: window[validatorName](value, field)
		 * @param {object} formData - Collected form data
		 * @returns {Promise<{valid: boolean, message: string|null}>}
		 */
		async function validateExtensionFields(formData) {
			var fields = getEnabledExtensionFieldDefs();
			for (var i = 0; i < fields.length; i++) {
				var field = fields[i];
				if (field.validator && formData.hasOwnProperty(field.key)) {
					var validatorFn = window[field.validator];
					if (typeof validatorFn === 'function') {
						try {
							var result = validatorFn(formData[field.key], field);
							// Support both sync and async validators
							if (result && typeof result.then === 'function') {
								result = await result;
							}
							if (result === false) {
								return {
									valid: false,
									message: '[[moderation-tools:extension-validation-failed, ' + (field.label || field.key) + ']]',
								};
							}
							if (typeof result === 'string') {
								return { valid: false, message: result };
							}
							if (result && typeof result === 'object' && !result.valid) {
								return {
									valid: false,
									message: result.message || '[[moderation-tools:extension-validation-failed, ' + (field.label || field.key) + ']]',
								};
							}
						} catch (err) {
							return {
								valid: false,
								message: '[[moderation-tools:extension-validator-error, ' + (field.label || field.key) + ']]',
							};
						}
					}
				}
			}
			return { valid: true, message: null };
		}

		// --- Extension field onSave callbacks ---

		/**
		 * Call onSave callbacks for extension fields after a successful save.
		 * onSave is a global function: window[onSaveName](value, field, cid)
		 * @param {object} formData - The saved form data
		 * @param {number} cid - The category ID
		 */
		function fireOnSaveCallbacks(formData, cid) {
			var fields = getEnabledExtensionFieldDefs();
			for (var i = 0; i < fields.length; i++) {
				var field = fields[i];
				if (field.onSave && formData.hasOwnProperty(field.key)) {
					var onSaveFn = window[field.onSave];
					if (typeof onSaveFn === 'function') {
						try {
							onSaveFn(formData[field.key], field, cid);
						} catch (err) {
							// Log but don't block - onSave is a post-save hook
							if (console && console.warn) {
								console.warn('[moderation-tools] onSave callback error for field "' + field.key + '":', err);
							}
						}
					}
				}
			}
		}

		// Load category data via API
		async function loadCategoryData(cid) {
			if (!cid) {
				$loading.addClass('hidden');
				$formContainer.addClass('hidden');
				return;
			}

			$loading.removeClass('hidden');
			$formContainer.addClass('hidden');

			try {
				var fallbackMsg = text.loadFailed || 'Failed to load category data';
				var response = await fetch(config.relative_path + '/api/v3/plugins/extra-tools/moderation-tools/category/' + cid, {
					credentials: 'same-origin',
					headers: { 'Accept': 'application/json' },
				});

				if (!response.ok) {
					// Safe JSON parsing for error responses
					var error = await safeParseJson(response, fallbackMsg);
					throw new Error(error.message || fallbackMsg);
				}

				var data = await response.json();
				// formatApiResponse wraps payload under 'response' key
				var payload = data.response || {};
				var category = payload.category || {};
				var categoryConfig = payload.config || {};

				// Update field visibility based on config
				var enabledFields = categoryConfig.enabledFields || {};
				$('.moderation-tools-field').not('.moderation-tools-extension-field').each(function () {
					var field = $(this).data('field');
					if (!enabledFields[field]) {
						$(this).addClass('hidden');
					} else {
						$(this).removeClass('hidden');
					}
				});

				// Handle tags group
				var tagsGroupVisible = enabledFields.minTags || enabledFields.maxTags;
				if (tagsGroupVisible) {
					$('[data-field-group="tags"]').removeClass('hidden');
					$('.mt-min-tags-field').toggleClass('hidden', !enabledFields.minTags);
					$('.mt-max-tags-field').toggleClass('hidden', !enabledFields.maxTags);
				} else {
					$('[data-field-group="tags"]').addClass('hidden');
				}

				// Update extension field visibility
				updateExtensionFieldVisibility(enabledFields);

				// Update sidebar visibility
				var sidebarActions = categoryConfig.enabledSidebarActions || {};
				if (sidebarActions.viewCategory) {
					$('#mt-sidebar-view').removeClass('hidden').attr('href', config.relative_path + '/category/' + cid);
				} else {
					$('#mt-sidebar-view').addClass('hidden');
				}
				if (sidebarActions.analytics) {
					$('#mt-sidebar-analytics').removeClass('hidden').attr('href', config.relative_path + '/admin/manage/categories/' + cid + '/analytics');
				} else {
					$('#mt-sidebar-analytics').addClass('hidden');
				}

				// Populate form fields (both core and extension)
				populateForm(category);

				// Filter parentCid dropdown to exclude current category
				var $parentCidSelect = $('#mt-parentCid');
				$parentCidSelect.find('option').each(function () {
					var optionCid = parseInt($(this).val(), 10);
					if (optionCid === cid) {
						// Disable current category option
						$(this).prop('disabled', true);
					} else {
						$(this).prop('disabled', false);
					}
				});

				// Store original data for change detection
				originalData = collectFormData();

				$loading.addClass('hidden');
				$formContainer.removeClass('hidden');
				hasChanges = false;
				$saveBtn.removeClass('btn-warning').addClass('btn-primary');
			} catch (err) {
			$loading.addClass('hidden');
			$formContainer.addClass('hidden');
			if (alerts) {
				alerts.error(err.message);
			}
		}
		}

		// Populate form with category data (handles both core and extension fields)
		function populateForm(category) {
			// Reset all fields to defaults first to prevent stale data
			$form.find('[data-name]').each(function () {
				var $el = $(this);
				if ($el.is('input[type="checkbox"]')) {
					$el.prop('checked', false);
				} else if ($el.is('select')) {
					$el.prop('selectedIndex', 0);
				} else {
					$el.val('');
				}
			});

			// Then populate with actual category values (both core and extension)
			$form.find('[data-name]').each(function () {
				var $el = $(this);
				var name = $el.data('name');
				var value = category[name];

				if (value === undefined || value === null) {
					// For extension fields, apply defaultValue if defined
					if ($el.closest('.moderation-tools-extension-field').length) {
						var fieldKey = name;
						var fieldDefs = getExtensionFieldDefs();
						var def = fieldDefs.find(function (f) { return f.key === fieldKey; });
						if (def && def.defaultValue !== undefined && def.defaultValue !== null) {
							value = def.defaultValue;
						} else {
							return;
						}
					} else {
						return;
					}
				}

				if ($el.is('input[type="checkbox"]')) {
					$el.prop('checked', !!parseInt(value, 10));
				} else if ($el.is('select')) {
					$el.val(value);
				} else {
					$el.val(value);
				}
			});

			// Sync color preview swatches with text input values
			$form.find('.mt-color-preview').each(function () {
				var targetId = $(this).data('target');
				var val = $('#' + targetId).val();
				if (val && /^#[0-9a-fA-F]{6}$/.test(val)) {
					$(this).val(val);
				} else {
					$(this).val('#000000');
				}
			});
		}

		// Collect form data, skipping hidden fields (includes extension fields)
		function collectFormData() {
			var data = {};
			$form.find('[data-name]').each(function () {
				var $el = $(this);
				var name = $el.data('name');

				// Skip hidden fields
				var $parentField = $el.closest('.moderation-tools-field');
				var $parentGroup = $el.closest('.moderation-tools-field-group');
				if ($parentField.hasClass('hidden')) {
					return;
				}
				if ($parentGroup.hasClass('hidden')) {
					return;
				}
				if ($el.hasClass('mt-min-tags-field') || $el.hasClass('mt-max-tags-field')) {
					if ($el.hasClass('hidden')) {
						return;
					}
				}

				if ($el.is('input[type="checkbox"]')) {
					data[name] = $el.is(':checked') ? 1 : 0;
				} else if ($el.is('input[type="number"]')) {
					data[name] = parseInt($el.val(), 10) || 0;
				} else {
					data[name] = $el.val();
				}
			});
			return data;
		}

		// Check for unsaved changes
		function checkChanges() {
			var currentData = collectFormData();
			hasChanges = JSON.stringify(currentData) !== JSON.stringify(originalData);
			if (hasChanges) {
				$saveBtn.removeClass('btn-primary').addClass('btn-warning');
			} else {
				$saveBtn.removeClass('btn-warning').addClass('btn-primary');
			}
		}

		// Save category data via API
		async function saveCategoryData() {
			if (isSaving) return;

			isSaving = true;

			var savingStr = text.saving || 'Saving...';
			$saveBtn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin me-1"></i> ' + $('<span>').text(savingStr).html());

			try {
				// collectFormData() already skips hidden fields; no need for a second filter loop
				var formData = collectFormData();

				// Validate extension fields before saving
				var validation = await validateExtensionFields(formData);
				if (!validation.valid) {
					var validationMsg = validation.message || 'Extension field validation failed.';
					// Try to translate if it's an i18n key
					var translatedMsg = await translateFieldText(validationMsg);
					throw new Error(translatedMsg);
				}

				var fallbackMsg = text.saveFailed || 'Failed to save';
				var response = await fetch(config.relative_path + '/api/v3/plugins/extra-tools/moderation-tools/category/' + currentCid, {
					method: 'PUT',
					credentials: 'same-origin',
					headers: {
						'Accept': 'application/json',
						'Content-Type': 'application/json',
						'x-csrf-token': config.csrf_token,
					},
					body: JSON.stringify(formData),
				});

				if (!response.ok) {
					// Safe JSON parsing for error responses
					var error = await safeParseJson(response, fallbackMsg);
					throw new Error(error.message || fallbackMsg);
				}

				// Update original data after successful save
				originalData = collectFormData();
				hasChanges = false;
				$saveBtn.removeClass('btn-warning').addClass('btn-primary');

			var successStr = text.saveSuccess || 'Category settings saved successfully.';
			if (alerts) {
				alerts.success(successStr);
			}

				// Update category name in selector if name was changed
				if (formData.name) {
					var $option = $cidSelect.find('option[value="' + currentCid + '"]');
					if ($option.length) {
						$option.text(formData.name + ' (CID: ' + currentCid + ')');
					}
				}

				// Fire onSave callbacks for extension fields
				fireOnSaveCallbacks(formData, currentCid);
		} catch (err) {
			if (alerts) {
				alerts.error(err.message);
			}
			} finally {
				isSaving = false;
				var saveStr = text.save || 'Save Changes';
				$saveBtn.prop('disabled', false).html('<i class="fa fa-save me-1"></i> ' + $('<span>').text(saveStr).html());
			}
		}

		// Event: category selector change (with unsaved changes confirmation)
		$cidSelect.on('change', function () {
			var newCid = parseInt($(this).val(), 10) || null;
			if (hasChanges) {
				var unsavedStr = text.unsavedChanges || 'You have unsaved changes. Are you sure you want to leave?';
				if (!confirm(unsavedStr)) {
					// Revert selector back to current cid
					$cidSelect.val(currentCid);
					return;
				}
			}
			currentCid = newCid;
			if (currentCid) {
				loadCategoryData(currentCid);
			}
		});

		// Event: save button click
		$saveBtn.on('click', function () {
			if (currentCid) {
				saveCategoryData();
			}
		});

		// Event: track form changes for unsaved indicator
		$form.on('change input', '[data-name]', function () {
			checkChanges();
		});

		// Color picker sync: color swatch updates text input and vice versa
		$form.on('input change', '.mt-color-preview', function () {
			var targetId = $(this).data('target');
			var $textInput = $('#' + targetId);
			$textInput.val($(this).val()).trigger('change');
		});
		$form.on('input change', '[data-name="bgColor"], [data-name="color"]', function () {
			var val = $(this).val();
			var $preview = $(this).closest('.d-flex').find('.mt-color-preview');
			if (val && /^#[0-9a-fA-F]{6}$/.test(val)) {
				$preview.val(val);
			}
		});

		// Warn before leaving with unsaved changes (namespaced for cleanup)
		$(window).off('beforeunload.moderationTools').on('beforeunload.moderationTools', function () {
			if (hasChanges) {
				var unsavedStr = text.unsavedChanges || 'You have unsaved changes.';
				return unsavedStr;
			}
		});

		// Initial field visibility from server-rendered config
		initFieldVisibility();

		// Render extension fields dynamically based on config
		renderExtensionFields().then(function () {
			// After extension fields are rendered, load initial category data
			if (currentCid) {
				loadCategoryData(currentCid);
			} else {
				$loading.addClass('hidden');
				$content.addClass('hidden');
				$empty.removeClass('hidden');
			}
		});
	};

	return ModerationTools;
});
