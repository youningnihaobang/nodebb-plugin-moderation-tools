'use strict';

/* global socket, app */

/**
 * ACP configuration page script.
 * Uses the standard #save button provided by admin/partials/settings/header.tpl.
 */
define('admin/plugins/moderation-tools', ['jquery', 'translator'], function ($, translator) {
	'use strict';

	var ACP = {};

	ACP.init = function () {
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

		$('#save').on('click', function () {
			var settings = collectSettings();

			socket.emit('plugins.moderation-tools.saveSettings', settings, function (err) {
				if (err) {
					if (typeof app !== 'undefined' && app.alert) {
						app.alertError(err.message);
					}
					return;
				}

				if (typeof app !== 'undefined' && app.alert) {
					translator.translate('[[moderation-tools:admin:save-success]]', function (translated) {
						app.alertSuccess(translated);
					});
				}
			});
		});
	};

	return ACP;
});
