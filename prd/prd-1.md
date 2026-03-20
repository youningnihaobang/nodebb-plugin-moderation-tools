# 介绍
- 该插件是nodebb的版主（catagory）管理插件,提供一个专门的版主管理页面供版主管理。

# 需求
- 提供一个页面用于版主管理，页面的url为extra-tools/moderation-tools，页面布局参考：src/views/admin/manage/category.tpl
- 提供一个ACP的管理页面，用于配置允许版主管理页可以管理拥有权限板块的哪些内容： 版块名、版块描述、版块句柄、主题模板、父版块、最近回复数、权限、分析 等，这个可管理的内容请参考NODEBB的src/views/admin/manage/category.tpl
- 提供一个nodebb的widgets，用于跳转到版主管理页面，该widgets需要验证在当前分类下，该用户是否有管理该分类（板块）的权限，如全局版主、版主、管理员，严格利用ACP的管理策略。

# 开发说明
- 严格按照nodebb的插件开发文档的规约进行开发：https://docs.nodebb.org/development/plugins/
