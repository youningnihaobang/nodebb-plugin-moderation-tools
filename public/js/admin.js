'use strict';

/* global socket, app */

/**
 * ACP configuration page script.
 * Wrapped in require() for jQuery dependency.
 * Uses translator module for i18n (Fix 1).
 */
require(['jquery', 'translator'], function ($, translator) {
	'use strict';

	$(function () {
		var $form = $('#moderation-tools-settings');

		function collectSettings() {
			var enabledFields = {};
			var enabledSidebarActions = {};

			$form.find('[data-field]').each(function () {
				var field = $(this).data('field');
				enabledFields[field] = $(this).is(':checked');
			});

			$form.find('[data-sidebar-action]').each(function () {
				var action = $(this).data('sidebar-action');
				enabledSidebarActions[action] = $(this).is(':checked');
			});

			return {
				enabledFields: enabledFields,
				enabledSidebarActions: enabledSidebarActions,
			};
		}

		$form.on('submit', function (e) {
			e.preventDefault();

			var settings = collectSettings();

			socket.emit('plugins.moderation-tools.saveSettings', settings, function (err) {
				if (err) {
					if (typeof app !== 'undefined' && app.alert) {
						app.alertError(err.message);
					}
					return;
				}

				if (typeof app !== 'undefined' && app.alert) {
					// Fix 1: Use translator module instead of [[...]] template syntax
					translator.translate('[[moderation-tools:admin:save-success]]', function (translated) {
						app.alertSuccess(translated);
					});
				}
			});
		});
	});
});
