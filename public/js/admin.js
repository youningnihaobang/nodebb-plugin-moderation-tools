'use strict';

/* global socket, $ */

require(['admin/settings'], function (Settings) {
	$(function () {
		const $form = $('#moderation-tools-settings');

		function collectSettings() {
			const enabledFields = {};
			const enabledSidebarActions = {};

			$form.find('[data-field]').each(function () {
				const field = $(this).data('field');
				enabledFields[field] = $(this).is(':checked');
			});

			$form.find('[data-sidebar-action]').each(function () {
				const action = $(this).data('sidebar-action');
				enabledSidebarActions[action] = $(this).is(':checked');
			});

			return {
				enabledFields: enabledFields,
				enabledSidebarActions: enabledSidebarActions,
			};
		}

		$form.on('submit', function (e) {
			e.preventDefault();

			const settings = collectSettings();

			socket.emit('plugins.moderation-tools.saveSettings', settings, function (err) {
				if (err) {
					if (typeof app !== 'undefined' && app.alert) {
						app.alertError(err.message);
					}
					return;
				}

				if (typeof app !== 'undefined' && app.alert) {
					app.alertSuccess('[[moderation-tools:admin:save-success]]');
				}

				// Also save via Settings API for the standard ACP save mechanism
				Settings.save('moderation-tools', $form.serializeArray());
			});
		});
	});
});
