import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { DateTime } from "luxon";
import pluginRss from "@11ty/eleventy-plugin-rss";
import pluginSyntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";

const RESERVED_TAGS = new Set(["posts", "all", "nav"]);

function walkPartials(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkPartials(fullPath));
      continue;
    }
    if (entry.isFile() && path.extname(entry.name) === ".hbs") {
      files.push(fullPath);
    }
  }

  return files;
}

function registerPartials() {
  const partialsDir = path.join(process.cwd(), "_includes", "partials");

  for (const fullPath of walkPartials(partialsDir)) {
    const relativeName = path
      .relative(partialsDir, fullPath)
      .replace(/\\/g, "/")
      .replace(/\.hbs$/, "");
    const basename = path.basename(fullPath, ".hbs");
    const contents = fs.readFileSync(fullPath, "utf8");

    Handlebars.registerPartial(relativeName, contents);
    if (!Handlebars.partials[basename]) {
      Handlebars.registerPartial(basename, contents);
    }
  }
}

function normalizeDate(dateObj) {
  if (!dateObj) return null;
  if (dateObj instanceof Date && !Number.isNaN(dateObj.getTime())) return dateObj;

  const parsed = new Date(dateObj);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeLimit(value, fallback = 160) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(pluginSyntaxHighlight);
  registerPartials();

  eleventyConfig.addExtension("hbs", {
    key: "hbs",
    outputFileExtension: "html",
    compile: async (inputContent) => {
      const template = Handlebars.compile(inputContent);
      return (data) => template(data);
    }
  });

  eleventyConfig.addPassthroughCopy({ assets: "assets" });

  const readableDate = (dateObj, formatOrOptions) => {
    const format =
      typeof formatOrOptions === "string" ? formatOrOptions : "dd LLL yyyy";
    const normalizedDate = normalizeDate(dateObj);
    if (!normalizedDate) return "";

    return DateTime.fromJSDate(normalizedDate, { zone: "utc" }).toFormat(format);
  };

  const htmlDateString = (dateObj) => {
    const normalizedDate = normalizeDate(dateObj);
    if (!normalizedDate) return "";

    return DateTime.fromJSDate(normalizedDate, { zone: "utc" }).toFormat(
      "yyyy-LL-dd"
    );
  };

  const year = (dateObj) => {
    const normalizedDate = normalizeDate(dateObj);
    if (!normalizedDate) return "";

    return DateTime.fromJSDate(normalizedDate, { zone: "utc" }).toFormat("yyyy");
  };

  const excerpt = (value, limitOrOptions = 160) => {
    const limit = normalizeLimit(limitOrOptions, 160);
    const text = String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trim()}...`;
  };

  const primaryTag = (tags) => {
    if (!Array.isArray(tags)) return "";
    const first = tags.find(
      (tag) => typeof tag === "string" && !RESERVED_TAGS.has(tag)
    );
    return first || "";
  };

  const slice = (array, start = 0, end = undefined) => {
    if (!Array.isArray(array)) return [];

    const normalizedStart = Number(start) || 0;
    const hasOptionsObject =
      end && typeof end === "object" && Object.prototype.hasOwnProperty.call(end, "hash");

    if (end === undefined || hasOptionsObject) {
      return array.slice(normalizedStart);
    }

    const normalizedEnd = Number(end);
    if (Number.isNaN(normalizedEnd)) {
      return array.slice(normalizedStart);
    }

    return array.slice(normalizedStart, normalizedEnd);
  };
  const slugify = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const toComparable = (value) =>
    typeof value === "number" ? value : Number.parseFloat(value);
  const gt = (a, b) => toComparable(a) > toComparable(b);
  const gte = (a, b) => toComparable(a) >= toComparable(b);
  const lt = (a, b) => toComparable(a) < toComparable(b);
  const lte = (a, b) => toComparable(a) <= toComparable(b);
  const eq = (a, b) => a === b;
  const ne = (a, b) => a !== b;
  const not = (value) => !value;
  const currentYear = () => DateTime.now().toFormat("yyyy");

  Handlebars.registerHelper("asset", (assetPath) => `/assets/${assetPath}`);
  Handlebars.registerHelper("readableDate", readableDate);
  Handlebars.registerHelper("htmlDateString", htmlDateString);
  Handlebars.registerHelper("year", year);
  Handlebars.registerHelper("currentYear", currentYear);
  Handlebars.registerHelper("excerpt", excerpt);
  Handlebars.registerHelper("primaryTag", primaryTag);
  Handlebars.registerHelper("slice", slice);
  Handlebars.registerHelper("slugify", slugify);
  Handlebars.registerHelper("gt", gt);
  Handlebars.registerHelper("gte", gte);
  Handlebars.registerHelper("lt", lt);
  Handlebars.registerHelper("lte", lte);
  Handlebars.registerHelper("eq", eq);
  Handlebars.registerHelper("ne", ne);
  Handlebars.registerHelper("not", not);

  eleventyConfig.addFilter("readableDate", readableDate);
  eleventyConfig.addFilter("htmlDateString", htmlDateString);
  eleventyConfig.addFilter("year", year);
  eleventyConfig.addFilter("excerpt", excerpt);
  eleventyConfig.addFilter("primaryTag", primaryTag);
  eleventyConfig.addFilter("slugify", slugify);

  eleventyConfig.addCollection("posts", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("content/posts/*.{md,hbs,html}")
      .sort((a, b) => b.date - a.date)
  );

  eleventyConfig.addCollection("tagList", (collectionApi) => {
    const tagSet = new Set();
    for (const item of collectionApi.getFilteredByTag("posts")) {
      const tags = item.data.tags || [];
      for (const tag of tags) {
        if (RESERVED_TAGS.has(tag)) continue;
        tagSet.add(tag);
      }
    }
    return [...tagSet].sort((a, b) => a.localeCompare(b));
  });

  return {
    dir: {
      input: "content",
      includes: "../_includes",
      data: "../_data",
      output: "_site"
    },
    markdownTemplateEngine: false,
    htmlTemplateEngine: false,
    dataTemplateEngine: false,
    templateFormats: ["md", "hbs", "njk", "html"]
  };
}
