'use strict';

/* global socket, config, $ */

const ModerationTools = {};

ModerationTools.init = function () {
	const $saveBtn = $('#moderation-tools-save');
	const $cidSelect = $('#moderation-tools-cid-select');
	const $form = $('#moderation-tools-form');
	const $loading = $('#moderation-tools-loading');
	const $formContainer = $('#moderation-tools-form-container');
	const $content = $('#moderation-tools-content');
	const $empty = $('#moderation-tools-empty');

	let currentCid = parseInt($cidSelect.val(), 10) || null;
	let originalData = {};
	let isSaving = false;
	let hasChanges = false;

	// Initialize enabled fields visibility based on config passed from server
	function initFieldVisibility() {
		// The config is passed from the server and embedded in the template
		// We need to re-check visibility when category data loads
		if (typeof ajaxify !== 'undefined' && ajaxify.data && ajaxify.data.config) {
			const enabledFields = ajaxify.data.config.enabledFields || {};
			$('.moderation-tools-field').each(function () {
				const field = $(this).data('field');
				if (!enabledFields[field]) {
					$(this).addClass('hidden');
				} else {
					$(this).removeClass('hidden');
				}
			});
			// Handle tags group
			const tagsGroupVisible = enabledFields.minTags || enabledFields.maxTags;
			if (tagsGroupVisible) {
				$('[data-field-group="tags"]').removeClass('hidden');
				$('.mt-min-tags-field').toggleClass('hidden', !enabledFields.minTags);
				$('.mt-max-tags-field').toggleClass('hidden', !enabledFields.maxTags);
			} else {
				$('[data-field-group="tags"]').addClass('hidden');
			}
		}
	}

	// Load category data
	async function loadCategoryData(cid) {
		if (!cid) {
			$loading.addClass('hidden');
			$formContainer.addClass('hidden');
			return;
		}

		$loading.removeClass('hidden');
		$formContainer.addClass('hidden');

		try {
			const response = await fetch(`${config.relative_path}/api/v3/plugins/extra-tools/moderation-tools/category/${cid}`, {
				credentials: 'same-origin',
				headers: { 'Accept': 'application/json' },
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to load category data');
			}

			const data = await response.json();
			const category = data.category || {};
			const categoryConfig = data.config || {};

			// Update field visibility based on config
			const enabledFields = categoryConfig.enabledFields || {};
			$('.moderation-tools-field').each(function () {
				const field = $(this).data('field');
				if (!enabledFields[field]) {
					$(this).addClass('hidden');
				} else {
					$(this).removeClass('hidden');
				}
			});

			// Handle tags group (minTags/maxTags) - show group if either is enabled
			const tagsGroupVisible = enabledFields.minTags || enabledFields.maxTags;
			if (tagsGroupVisible) {
				$('[data-field-group="tags"]').removeClass('hidden');
				$('.mt-min-tags-field').toggleClass('hidden', !enabledFields.minTags);
				$('.mt-max-tags-field').toggleClass('hidden', !enabledFields.maxTags);
			} else {
				$('[data-field-group="tags"]').addClass('hidden');
			}

			// Update sidebar visibility
			const sidebarActions = categoryConfig.enabledSidebarActions || {};
			if (sidebarActions.viewCategory) {
				$('#mt-sidebar-view').removeClass('hidden').attr('href', `${config.relative_path}/category/${cid}`);
			} else {
				$('#mt-sidebar-view').addClass('hidden');
			}
			if (sidebarActions.analytics) {
				$('#mt-sidebar-analytics').removeClass('hidden').attr('href', `${config.relative_path}/admin/manage/categories/${cid}/analytics`);
			} else {
				$('#mt-sidebar-analytics').addClass('hidden');
			}

			// Populate form fields
			populateForm(category);

			// Store original data for change detection
			originalData = collectFormData();

			$loading.addClass('hidden');
			$formContainer.removeClass('hidden');
			hasChanges = false;
			$saveBtn.removeClass('btn-warning').addClass('btn-primary');
		} catch (err) {
			$loading.addClass('hidden');
			$formContainer.addClass('hidden');
			if (typeof app !== 'undefined' && app.alert) {
				app.alertError(err.message);
			}
		}
	}

	// Populate form with category data
	function populateForm(category) {
		$form.find('[data-name]').each(function () {
			const $el = $(this);
			const name = $el.data('name');
			const value = category[name];

			if (value === undefined || value === null) {
				return;
			}

			if ($el.is('input[type="checkbox"]')) {
				$el.prop('checked', !!parseInt(value, 10));
			} else if ($el.is('input[type="color"]')) {
				$el.val(value || '#000000');
			} else if ($el.is('select')) {
				$el.val(value);
			} else {
				$el.val(value);
			}
		});
	}

	// Collect form data
	function collectFormData() {
		const data = {};
		$form.find('[data-name]').each(function () {
			const $el = $(this);
			const name = $el.data('name');

			// Skip hidden fields (individual fields or tags group items)
			const $parentField = $el.closest('.moderation-tools-field');
			const $parentGroup = $el.closest('.moderation-tools-field-group');
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

	// Check for changes
	function checkChanges() {
		const currentData = collectFormData();
		hasChanges = JSON.stringify(currentData) !== JSON.stringify(originalData);
		if (hasChanges) {
			$saveBtn.removeClass('btn-primary').addClass('btn-warning');
		} else {
			$saveBtn.removeClass('btn-warning').addClass('btn-primary');
		}
	}

	// Save category data
	async function saveCategoryData() {
		if (isSaving) return;

		isSaving = true;
		$saveBtn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin me-1"></i> [[moderation-tools:saving]]');

		try {
			const formData = collectFormData();
			// Remove fields that are hidden (not enabled)
			$form.find('[data-name]').each(function () {
				const $el = $(this);
				const name = $el.data('name');
				if ($el.closest('.moderation-tools-field').hasClass('hidden')) {
					delete formData[name];
				}
			});

			const response = await fetch(`${config.relative_path}/api/v3/plugins/extra-tools/moderation-tools/category/${currentCid}`, {
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
				const error = await response.json();
				throw new Error(error.message || 'Failed to save');
			}

			const result = await response.json();

			// Update original data
			originalData = collectFormData();
			hasChanges = false;
			$saveBtn.removeClass('btn-warning').addClass('btn-primary');

			if (typeof app !== 'undefined' && app.alert) {
				app.alertSuccess('[[moderation-tools:save-success]]');
			}

			// Update category name in selector if name was changed
			if (formData.name) {
				const $option = $cidSelect.find(`option[value="${currentCid}"]`);
				if ($option.length) {
					$option.text(`${formData.name} (CID: ${currentCid})`);
				}
			}
		} catch (err) {
			if (typeof app !== 'undefined' && app.alert) {
				app.alertError(err.message);
			}
		} finally {
			isSaving = false;
			$saveBtn.prop('disabled', false).html('<i class="fa fa-save me-1"></i> [[moderation-tools:save]]');
		}
	}

	// Event listeners
	$cidSelect.on('change', function () {
		currentCid = parseInt($(this).val(), 10) || null;
		if (currentCid) {
			loadCategoryData(currentCid);
		}
	});

	$saveBtn.on('click', function () {
		if (currentCid) {
			saveCategoryData();
		}
	});

	// Track form changes
	$form.on('change input', '[data-name]', function () {
		checkChanges();
	});

	// Warn before leaving with unsaved changes
	$(window).on('beforeunload', function () {
		if (hasChanges) {
			return '[[moderation-tools:unsaved-changes]]';
		}
	});

	// Handle ajaxify page changes
	$(window).on('action:ajaxify.end', function () {
		if ($('[data-ajaxify="extra-tools/moderation-tools"]').length ||
			$('#moderation-tools').length) {
			initFieldVisibility();
		}
	});

	// Initial load
	initFieldVisibility();
	if (currentCid) {
		loadCategoryData(currentCid);
	} else {
		$loading.addClass('hidden');
		$content.addClass('hidden');
		$empty.removeClass('hidden');
	}
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', function () {
		ModerationTools.init();
	});
} else {
	ModerationTools.init();
}
