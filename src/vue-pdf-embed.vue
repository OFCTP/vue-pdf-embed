<template>
  <div :id="id" class="vue-pdf-embed">
    <div
      v-for="pageNum in pageNums"
      :key="pageNum"
      :id="id && `${id}-${pageNum}`"
      style="position: relative"
    >
      <canvas
        :id="`canvas-${pageNum}`"
        :ref="`canvas-${pageNum}`"
        style="z-index: 0; position: absolute"
      />
      <canvas
        :id="`canvas-${pageNum}-draws`"
        :ref="`canvas-${pageNum}-draws`"
        :page="`${pageNum}`"
        style="z-index: 30; position: absolute"
        @click="handleEvent"
        @mousedown="handleEvent"
        @mouseup="handleEvent"
        @mousemove="handleEvent"
        @touchstart="handleEvent"
        @touchend="handleEvent"
        @touchmove="handleEvent"
        @wheel="handleEvent"
        @scroll="handleEvent"
      />

      <div v-if="!disableTextLayer" class="textLayer" />

      <div v-if="!disableAnnotationLayer" class="annotationLayer" />

      <div style="clear: both"></div>
    </div>
  </div>
</template>

<script>
import * as pdf from 'pdfjs-dist/legacy/build/pdf.js'
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.js'
import { PDFLinkService } from 'pdfjs-dist/legacy/web/pdf_viewer.js'
import {
  // addPrintStyles,
  // createPrintIframe,
  emptyElement,
  releaseChildCanvases,
} from './util.js'

pdf.GlobalWorkerOptions.workerPort = new PdfWorker()

export default {
  name: 'VuePdfEmbed',
  props: {
    /**
     * Whether the annotation layer should be disabled.
     * @values Boolean
     */
    disableAnnotationLayer: Boolean,
    /**
     * Whether the text layer should be disabled.
     * @values Boolean
     */
    disableTextLayer: Boolean,
    /**
     * Desired page height.
     * @values Number, String
     */
    height: [Number, String],
    /**
     * Component identifier (inherited by page containers with page number
     * postfixes).
     * @values String
     */
    id: String,
    /**
     * Path for annotation icons, including trailing slash.
     * @values String
     */
    imageResourcesPath: String,
    /**
     * Number of the page to display.
     * @values Number
     */
    page: Number,
    /**
     * Desired page rotation angle.
     * @values Number, String
     */
    rotation: {
      type: [Number, String],
      validator(value) {
        if (value % 90 !== 0) {
          throw new Error('Rotation must be 0 or a multiple of 90.')
        }
        return true
      },
    },
    /**
     * Desired ratio of canvas size to document size.
     * @values Number
     */
    scale: Number,
    /**
     * Source of the document to display.
     * @values Object, String, URL, TypedArray
     */
    source: {
      type: [Object, String, URL, Uint8Array],
      required: true,
    },
    /**
     * Desired page width.
     * @values Number, String
     */
    width: [Number, String],
    /**
     * Desired margin between pages
     * @values Number
     */
    margin: Number,
    cameraOffsetX: Number,
    cameraOffsetY: Number,
  },
  data() {
    return {
      document: null,
      pageCount: null,
      pageNums: [],
    }
  },
  computed: {
    linkService() {
      if (!this.document || this.disableAnnotationLayer) {
        return null
      }

      const service = new PDFLinkService()
      service.setDocument(this.document)
      service.setViewer({
        scrollPageIntoView: ({ pageNumber }) => {
          this.$emit('internal-link-clicked', pageNumber)
        },
      })
      return service
    },
  },
  created() {
    this.$watch(
      () => [
        this.source,
        this.disableAnnotationLayer,
        this.disableTextLayer,
        this.height,
        this.page,
        this.rotation,
        this.width,
        this.scale
      ],
      async ([newSource], [oldSource]) => {
        if (newSource !== oldSource) {
          console.log('source changed, reset document...', newSource)
          releaseChildCanvases(this.$el)
          await this.document?.destroy()
          await this.load()
        }
        await this.render()
      }
    )
    this.$watch(
      () => [this.cameraOffsetX, this.cameraOffsetY],
      async () => {
        console.log('offset changed...', this.cameraOffsetX, this.cameraOffsetY)
        await this.update()
      }
      // TODO : THIS CAUSES FLICKERING AND SHOULD BE OPTIMIZED !
      // async () =>  await this.render()
    )
  },
  async mounted() {
    await this.load()
    await this.render()
  },
  beforeDestroy() {
    releaseChildCanvases(this.$el)
    this.document?.destroy()
  },
  methods: {
    /**
     * Returns an array of the actual page width and height based on props and
     * aspect ratio.
     * @param {number} ratio - Page aspect ratio.
     */
    getPageDimensions(ratio) {
      let width, height

      if (this.height && !this.width) {
        height = this.height
        width = height / ratio
      } else {
        width = this.width || this.$el.clientWidth
        height = width * ratio
      }

      return [width, height]
    },
    /**
     * Loads a PDF document. Defines a password callback for protected
     * documents.
     *
     * NOTE: Ignored if source property is not provided.
     */
    async load() {
      if (!this.source) {
        return
      }

      console.log('loading document...', this.source)

      try {
        if (this.source._pdfInfo) {
          this.document = this.source
        } else {
          const documentLoadingTask = pdf.getDocument(this.source)
          documentLoadingTask.onProgress = (progressParams) => {
            this.$emit('progress', progressParams)
          }
          documentLoadingTask.onPassword = (callback, reason) => {
            const retry = reason === pdf.PasswordResponses.INCORRECT_PASSWORD
            this.$emit('password-requested', callback, retry)
          }
          this.document = await documentLoadingTask.promise
        }
        this.pageCount = this.document.numPages
        console.log('document loaded !')
        this.$emit('loaded', this.document)
      } catch (e) {
        this.document = null
        this.pageCount = null
        this.pageNums = []
        this.$emit('loading-failed', e)
      }
    },

    async render() {
      if (!this.document) {
        return
      }

      try {
        this.pageNums = this.page
          ? [this.page]
          : [...Array(this.document.numPages + 1).keys()].slice(1)

        await Promise.all(
          this.pageNums.map(async (pageNum, i) => {
            const page = await this.document.getPage(pageNum)
            const [canvas, draws, div1, div2] = this.$el.children[i].children
            const [actualWidth, actualHeight] = this.getPageDimensions(
              page.view[3] / page.view[2]
            )

            if ((this.rotation / 90) % 2) {
              canvas.style.width = `${Math.floor(actualHeight)}px`
              // canvas.style.height = `${Math.floor(actualWidth)}px`
            } else {
              canvas.style.width = `${Math.floor(actualWidth)}px`
              // canvas.style.height = `${Math.floor(actualHeight)}px`
            }

            // Propagate the height to the nested canvas
            draws.style.width = canvas.style.width
            // draws.style.height = canvas.style.height

            // set margins
            canvas.style.margin = `${Math.floor(this.margin)}px`
            draws.style.margin = `${Math.floor(this.margin)}px`

            await this.renderPage(page, canvas, draws, actualWidth)

            if (!this.disableTextLayer) {
              await this.renderPageTextLayer(page, div1, actualWidth)
            }

            if (!this.disableAnnotationLayer) {
              await this.renderPageAnnotationLayer(
                page,
                div2 || div1,
                actualWidth
              )
            }
          })
        )

        this.$emit('rendered')
      } catch (e) {
        this.document = null
        this.pageCount = null
        this.pageNums = []
        this.$emit('rendering-failed', e)
      }
    },

    async update() {
      if (!this.document) {
        return
      }

      try {
        this.pageNums = this.page
          ? [this.page]
          : [...Array(this.document.numPages + 1).keys()].slice(1)

        console.log('updating...', this.pageNums)

        await Promise.all(
          this.pageNums.map(async (pageNum, i) => {
            const page = await this.document.getPage(pageNum)
            const [canvas, draws] = this.$el.children[i].children
            this.updatePage(page, canvas, draws)
          })
        )
      } catch (e) {
        this.document = null
        this.pageCount = null
        this.pageNums = []
        this.$emit('update-failed', e)
      }
    },

    /**
     * Renders the page content.
     * @param {PDFPageProxy} page - Page proxy.
     * @param {HTMLCanvasElement} canvas - HTML canvas.
     * @param {HTMLCanvasElement} draws - HTML canvas drawings.
     * @param {number} width - Actual page width.
     */
    async renderPage(page, canvas, draws, width) {
      const viewport = page.getViewport({
        scale: Math.ceil(width / page.view[2]) + 1,
        rotation: this.rotation,
      })

      canvas.width = draws.width = viewport.width
      canvas.height = draws.height = viewport.height

      const context = canvas.getContext('2d')
      const contextDraws = draws.getContext('2d')
      let scale = Math.max(this.scale, 1)
      context.scale(scale, scale)
      contextDraws.scale(scale, scale)
      context.translate(this.cameraOffsetX ?? 0, this.cameraOffsetY ?? 0)
      contextDraws.translate(this.cameraOffsetX ?? 0, this.cameraOffsetY ?? 0)

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise
    },

    updatePage(page, canvas, draws) {
      console.log('updating page', page)
      const context = canvas.getContext('2d')
      const contextDraws = draws.getContext('2d')
      context.translate(this.cameraOffsetX ?? 0, this.cameraOffsetY ?? 0)
      contextDraws.translate(this.cameraOffsetX ?? 0, this.cameraOffsetY ?? 0)
    },

    handleEvent(event) {
      this.$emit(
        'canvasEvent',
        event,
        event.target?.attributes?.getNamedItem('page')?.value
      )
    },
    /**
     * Renders the annotation layer for the specified page.
     * @param {PDFPageProxy} page - Page proxy.
     * @param {HTMLElement} container - HTML container.
     * @param {number} width - Actual page width.
     */
    async renderPageAnnotationLayer(page, container, width) {
      emptyElement(container)
      pdf.AnnotationLayer.render({
        annotations: await page.getAnnotations(),
        div: container,
        linkService: this.linkService,
        page,
        renderInteractiveForms: false,
        viewport: page
          .getViewport({
            scale: width / page.view[2],
            rotation: this.rotation,
          })
          .clone({
            dontFlip: true,
          }),
        imageResourcesPath: this.imageResourcesPath,
      })
    },
    /**
     * Renders the text layer for the specified page.
     * @param {PDFPageProxy} page - Page proxy.
     * @param {HTMLElement} container - HTML container.
     * @param {number} width - Actual page width.
     */
    async renderPageTextLayer(page, container, width) {
      emptyElement(container)
      await pdf.renderTextLayer({
        container,
        textContent: await page.getTextContent(),
        viewport: page.getViewport({
          scale: width / page.view[2],
          rotation: this.rotation,
        }),
      }).promise
    },
  },
}
</script>

<style lang="scss">
@import 'styles/text-layer';
@import 'styles/annotation-layer';

.vue-pdf-embed {
  & > div {
    position: relative;
  }

  canvas {
    display: block;
  }
}
</style>
