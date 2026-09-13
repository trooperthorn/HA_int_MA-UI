/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
// The "md" iconset and its font are gone: material-design-icons-iconfont was
// last published in 2022 by a single maintainer, and the whole font was being
// loaded to serve one glyph. "mdi" (@mdi/font, ~114 glyphs in use) stays as
// the default set; new icons should use @lucide/vue, which the rest of the
// app already uses.
import "@mdi/font/css/materialdesignicons.css";
import { aliases as defaultAliases, mdi } from "vuetify/iconsets/mdi";
import "./vuetify.css";

// Composables
import { IconAliases, createVuetify } from "vuetify";

const aliases: IconAliases = {
  ...defaultAliases,
};

export default createVuetify(
  // https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
  {
    icons: {
      defaultSet: "mdi",
      aliases,
      sets: {
        mdi,
      },
    },
    display: {
      mobileBreakpoint: "md",
      thresholds: {
        xs: 0,
        sm: 340,
        md: 540,
        lg: 800,
        xl: 1280,
      },
    },
    theme: {
      // Use a private id rather than the well-known
      // "vuetify-theme-stylesheet" default: anything injecting CSS into
      // the page (extensions, userscripts, other libraries) can target
      // the public id by name and overwrite the runtime CSS variables.
      stylesheetId: "mass-vuetify-theme",
      defaultTheme: "dark",
      themes: {
        light: {
          dark: false,
          colors: {
            fg: "#000000",
            background: "#f5f5f5",
            overlay: "#e7e7e7ff",
            panel: "#ffffff",
            default: "#ffffff",
            primary: "#03a9f4",
          },
        },
        dark: {
          dark: true,
          colors: {
            fg: "#ffffff",
            background: "#181818",
            overlay: "#181818",
            panel: "#232323",
            default: "#000000",
            primary: "#03a9f4",
          },
        },
      },
    },
  },
);
