'use strict';

define('admin/plugins/moderation-tools', ['settings', 'alerts', 'translator'], function (Settings, alerts, translator) {
	var ACP = {};

	ACP.init = function () {
		Settings.load('moderation-tools', $('.moderation-tools-settings'));

		// Insert group headers into the field list based on data-group attributes
		ACP.insertGroupHeaders();

		$('#save').on('click', function () {
			Settings.save('moderation-tools', $('.moderation-tools-settings'), function (err) {
				if (err) {
					alerts.error(err);
				} else {
					alerts.success('[[admin/admin:changes-saved]]');
				}
			});
		});
	};

	/**
	 * Insert visual group headers between field list items.
	 * Fields have data-group attributes; a header is inserted when the group changes.
	 */
	ACP.insertGroupHeaders = function () {
		var $list = $('#moderation-tools-fields-list');
		if (!$list.length) {
			return;
		}

		var $items = $list.children('[data-group]');
		var lastGroup = null;
		var groupLabels = {
			core: '[[moderation-tools:fields-group-core]]',
		};

		$items.each(function () {
			var $item = $(this);
			var group = $item.attr('data-group') || 'core';

			if (group !== lastGroup) {
				var labelText = groupLabels[group] || group;
				var $header = $('<div class="moderation-tools-field-group-header"></div>');
				// Use a span to hold the label, which will be translated below
				$header.html('<span>' + labelText + '</span>');
				$item.before($header);
				lastGroup = group;
			}
		});

		// Translate any i18n keys in the inserted headers
		$list.find('.moderation-tools-field-group-header span').each(function () {
			var $span = $(this);
			var text = $span.text();
			if (text.indexOf('[[') === 0) {
				translator.translate(text).then(function (translated) {
					$span.text(translated);
				});
			}
		});
	};

	return ACP;
});
