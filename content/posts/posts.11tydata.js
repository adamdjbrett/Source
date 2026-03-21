export default {
  layout: "layouts/post.hbs",
  tags: ["posts"],
  permalink: (data) => `/${data.page.fileSlug}/index.html`
};
