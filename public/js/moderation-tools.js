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

				// Populate form fields
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

		// Populate form with category data
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

			// Then populate with actual category values
			$form.find('[data-name]').each(function () {
				var $el = $(this);
				var name = $el.data('name');
				var value = category[name];

				if (value === undefined || value === null) {
					return;
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

		// Collect form data, skipping hidden fields
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

		// Load initial category data
		if (currentCid) {
			loadCategoryData(currentCid);
		} else {
			$loading.addClass('hidden');
			$content.addClass('hidden');
			$empty.removeClass('hidden');
		}
	};

	return ModerationTools;
});
