import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addComponentsDir, addPluginTemplate, defineNuxtModule, extendWebpackConfig, isNuxt2, isNuxt3 } from '@nuxt/kit'
import WebpackPlugin from '@unocss/webpack'
import type { VitePluginConfig } from '@unocss/vite'
import VitePlugin from '@unocss/vite'
import type { NuxtPlugin } from '@nuxt/schema'
import { loadConfig } from '@unocss/config'
import type { UserConfig } from '@unocss/core'
import { resolveOptions } from './options'
import type { UnocssNuxtOptions } from './types'

export { UnocssNuxtOptions }

const dir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtModule<UnocssNuxtOptions>({
  meta: {
    name: 'unocss',
    configKey: 'unocss',
  },
  defaults: {
    mode: 'global',
    autoImport: true,
    preflight: false,
    components: true,

    // presets
    uno: true,
    attributify: false,
    webFonts: false,
    icons: false,
    wind: false,
  },
  async setup(options, nuxt) {
    // preset shortcuts
    resolveOptions(options)

    options.mode ??= 'global'
    const InjectModes: VitePluginConfig['mode'][] = ['global', 'dist-chunk']

    if (options.autoImport) {
      addPluginTemplate({
        filename: 'unocss.mjs',
        getContents: () => {
          const lines = [
            InjectModes.includes(options.mode) ? 'import \'uno.css\'' : '',
            isNuxt2()
              ? 'export default () => {}'
              : 'import { defineNuxtPlugin } from \'#imports\'; export default defineNuxtPlugin(() => {})',
          ]
          if (options.preflight)
            lines.unshift('import \'@unocss/reset/tailwind.css\'')
          return lines.join('\n')
        },
      })
    }

    if (options.components) {
      addComponentsDir({
        path: resolve(dir, '../runtime'),
        watch: false,
      })
    }

    const { config: unoConfig } = await loadConfig<UserConfig>(process.cwd(), {
      configFile: options.configFile,
    }, [], options)

    await nuxt.callHook('unocss:config', unoConfig)

    if (
      isNuxt3()
      && nuxt.options.builder === '@nuxt/vite-builder'
      && nuxt.options.postcss.plugins.cssnano
      && unoConfig.transformers?.some(t => t.name === '@unocss/transformer-directives' && t.enforce !== 'pre')
    ) {
      const preset = nuxt.options.postcss.plugins.cssnano.preset
      nuxt.options.postcss.plugins.cssnano = {
        preset: [preset?.[0] || 'default', Object.assign(
          preset?.[1] || {}, { mergeRules: false, normalizeWhitespace: false, discardComments: false },
        )],
      }
    }

    nuxt.hook('vite:extend', ({ config }) => {
      config.plugins = config.plugins || []
      config.plugins.unshift(...VitePlugin({ mode: options.mode }, unoConfig))
    })

    if (nuxt.options.dev) {
      // @ts-expect-error missing type
      nuxt.hook('devtools:customTabs', (tabs) => {
        tabs.push({
          title: 'UnoCSS',
          name: 'unocss',
          icon: '/__unocss/favicon.svg',
          view: {
            type: 'iframe',
            src: '/__unocss/',
          },
        })
      })
    }

    // Nuxt 2
    if (isNuxt2()) {
      nuxt.hook('app:resolve', (config) => {
        const plugin: NuxtPlugin = { src: 'unocss.mjs', mode: 'client' }
        if (config.plugins)
          config.plugins.push(plugin)
        else
          config.plugins = [plugin]
      })
    }

    extendWebpackConfig((config) => {
      config.plugins = config.plugins || []
      config.plugins.unshift(WebpackPlugin({}, unoConfig))
    })
  },
})

declare module '@nuxt/schema' {
  interface NuxtConfig {
    unocss?: UnocssNuxtOptions
  }
  interface NuxtOptions {
    unocss?: UnocssNuxtOptions
  }
}
