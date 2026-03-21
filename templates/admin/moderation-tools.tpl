<div class="acp-page-container">
	<!-- IMPORT admin/partials/settings/header.tpl -->

	<div class="row m-0">
		<div id="spy-container" class="col-12 px-2 mb-4" tabindex="0">
			<h5 class="fw-bold tracking-tight settings-header">[[moderation-tools:admin.description]]</h5>

			<form id="moderation-tools-settings" role="form" class="moderation-tools-settings">
				<div class="mb-4">
					<h5 class="fw-bold tracking-tight settings-header">[[moderation-tools:admin.fields-title]]</h5>
					<p class="form-text text-muted">
						[[moderation-tools:admin.fields-help]]
					</p>
					<div class="card">
						<div class="card-body p-0">
							<div class="list-group list-group-flush">
								{{{ each allFields }}}
								<div class="list-group-item d-flex justify-content-between align-items-center">
									<div>
										<strong>[[moderation-tools:fields.{@value}]]</strong>
										<small class="text-muted d-block"><code>{@value}</code></small>
									</div>
									<div class="form-check form-switch mb-0">
										<input type="checkbox" class="form-check-input" data-field="{@value}" {{{ if enabledFields[@value] }}}checked{{{ end }}} />
									</div>
								</div>
								{{{ end }}}
							</div>
						</div>
					</div>
				</div>

				<div class="mb-4">
					<h5 class="fw-bold tracking-tight settings-header">[[moderation-tools:admin.sidebar-title]]</h5>
					<p class="form-text text-muted">
						[[moderation-tools:admin.sidebar-help]]
					</p>
					<div class="card">
						<div class="card-body p-0">
							<div class="list-group list-group-flush">
								{{{ each sidebarActions }}}
								<div class="list-group-item d-flex justify-content-between align-items-center">
									<div>
										<strong>[[moderation-tools:sidebar-actions.{@value}]]</strong>
										<small class="text-muted d-block"><code>{@value}</code></small>
									</div>
									<div class="form-check form-switch mb-0">
										<input type="checkbox" class="form-check-input" data-sidebar-action="{@value}" {{{ if enabledSidebarActions[@value] }}}checked{{{ end }}} />
									</div>
								</div>
								{{{ end }}}
							</div>
						</div>
					</div>
				</div>

				<div class="mb-4">
					<h5 class="fw-bold tracking-tight settings-header">[[moderation-tools:admin.policy-title]]</h5>
					<div class="alert alert-info">
						<ul class="mb-0">
							<li>[[moderation-tools:admin.policy-uniform]]</li>
							<li>[[moderation-tools:admin.policy-no-per-user]]</li>
							<li>[[moderation-tools:admin.policy-instant]]</li>
						</ul>
					</div>
				</div>
			</form>
		</div>
	</div>
</div>
