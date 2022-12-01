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
  addPrintStyles,
  createPrintIframe,
  emptyElement,
  releaseCanvas,
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
     * Source of the document to display.
     * @values String, URL, TypedArray
     */
    source: {
      type: [Object, String, Uint8Array],
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
    /**
     * Desired zoom
     * @values Number
     */
    scale: Number,
    cameraOffsetX: Number,
    cameraOffsetY: Number
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
      ],
        async ([newSource], [oldSource]) => {
        if (newSource !== oldSource) {
          this.$el.querySelectorAll('canvas').forEach(releaseCanvas)
          await this.document?.destroy()
          await this.load()
        }
          await this.render()
      }
    )
    /*
    optimisation ?
     */
    this.$watch(
        () => [
          this.scale,
          this.cameraOffsetX,
          this.cameraOffsetY
        ],
        async () => {
          await this.render()
          //await this.updateCanvas()
        }
    )
  },
  async mounted() {
    await this.load()
    this.render()
  },
  beforeDestroy() {
    this.$el.querySelectorAll('canvas').forEach(releaseCanvas)
    this.document?.destroy()
  },
  beforeUnmount() {
    this.$el.querySelectorAll('canvas').forEach(releaseCanvas)
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

      try {
        if (this.source._pdfInfo) {
          this.document = this.source
        } else {
          const documentLoadingTask = pdf.getDocument(this.source)
          documentLoadingTask.onPassword = (callback, reason) => {
            const retry = reason === pdf.PasswordResponses.INCORRECT_PASSWORD
            this.$emit('password-requested', callback, retry)
          }
          this.document = await documentLoadingTask.promise
        }
        this.pageCount = this.document.numPages
        this.$emit('loaded', this.document)
      } catch (e) {
        this.document = null
        this.pageCount = null
        this.pageNums = []
        this.$emit('loading-failed', e)
      }
    },
    /**
     * Prints a PDF document via the browser interface.
     *
     * NOTE: Ignored if the document is not loaded.
     *
     * @param {number} dpi - Print resolution.
     * @param {string} filename - Predefined filename to save.
     */
    async print(dpi = 300, filename = '') {
      if (!this.document || !this.pageNums.length) {
        return
      }

      const printUnits = dpi / 72
      const styleUnits = 96 / 72
      let container, iframe, title

      try {
        container = document.createElement('div')
        container.style.display = 'none'
        window.document.body.appendChild(container)
        iframe = await createPrintIframe(container)

        await Promise.all(
          this.pageNums.map(async (pageNum, i) => {
            const page = await this.document.getPage(pageNum)
            const viewport = page.getViewport({ scale: 1 })

            if (i === 0) {
              const sizeX = (viewport.width * printUnits) / styleUnits
              const sizeY = (viewport.height * printUnits) / styleUnits
              addPrintStyles(iframe, sizeX, sizeY)
            }

            const canvas = document.createElement('canvas')
            canvas.width = viewport.width * printUnits
            canvas.height = viewport.height * printUnits
            container.appendChild(canvas)
            const canvasClone = canvas.cloneNode()
            iframe.contentWindow.document.body.appendChild(canvasClone)

            await page.render({
              canvasContext: canvas.getContext('2d'),
              intent: 'print',
              transform: [printUnits, 0, 0, printUnits, 0, 0],
              viewport,
            }).promise

            canvasClone.getContext('2d').drawImage(canvas, 0, 0)
          })
        )

        if (filename) {
          title = window.document.title
          window.document.title = filename
        }

        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch (e) {
        console.error(e)
        this.$emit('printing-failed', e)
      } finally {
        if (filename && title) {
          window.document.title = title
        }

        if (container) {
          container.parentNode.removeChild(container)
        }
      }
    },
    /**
     * Renders the PDF document as SVG element(s) and additional layers.
     *
     * NOTE: Ignored if the document is not loaded.
     */
    async updateCanvas() {
      console.log("updateCanvas")
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
              const viewport = page.getViewport({
                scale: Math.ceil(actualWidth / page.view[2]) + 1,
                rotation: this.rotation,
              })
              const context = canvas.getContext('2d')
              const contextDraws = draws.getContext('2d')
              let scale = this.scale > 1 ? this.scale : 1
              context.scale(scale, scale)
              contextDraws.scale(scale, scale)
              context.translate( (-canvas.width / 2) + (this.cameraOffsetX ?? 0), (-canvas.height / 2) + (this.cameraOffsetY ?? 0) )
              contextDraws.translate( (-draws.width / 2) + (this.cameraOffsetX ?? 0), (-draws.height / 2) + (this.cameraOffsetY ?? 0) )
              await page.render({
                canvasContext: context,
                viewport,
              }).promise
            })
        )
      } catch (e) {
        console.error(e);
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
              canvas.style.height = `${Math.floor(actualWidth)}px`
            } else {
              canvas.style.width = `${Math.floor(actualWidth)}px`
              canvas.style.height = `${Math.floor(actualHeight)}px`
            }

            // Set the height, width and margin of the div container
            this.$el.children[i].style.height = `${Math.floor(actualHeight)}px`
            this.$el.children[i].style.width = `${Math.floor(actualWidth)}px`
            this.$el.children[i].style.margin = `${Math.floor(this.margin)}px`
            // Propagate the height to the nested canvas
            draws.style.width = canvas.style.width
            draws.style.height = canvas.style.height
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
        console.error(e)
        if (e.message === 'Transport destroyed') {
          return
        }
        this.document = null
        this.pageCount = null
        this.pageNums = []
        this.$emit('rendering-failed', e)
      }
    },
    /**
     * Renders the page content.
     * @param {PDFPageProxy} page - Page proxy.
     * @param {HTMLCanvasElement} canvas - HTML canvas.
     * @param {HTMLCanvasElement} canvas - HTML canvas drawings.
     * @param {number} width - Actual page width.
     */
    async renderPage(page, canvas, draws, width) {
      const viewport = page.getViewport({
        scale: Math.ceil(width / page.view[2]) + 1,
        rotation: this.rotation,
      })

      //console.log(viewport)

      canvas.width = viewport.width
      canvas.height = viewport.height
      draws.width = viewport.width
      draws.height = viewport.height

      const context = canvas.getContext('2d')
      /*
      to optimize
       */
      const contextDraws = draws.getContext('2d')
      let scale = this.scale > 1 ? this.scale : 1
      context.scale(scale, scale)
      contextDraws.scale(scale, scale)
      context.translate( 0 + (this.cameraOffsetX ?? 0), 0 + (this.cameraOffsetY ?? 0) )
      contextDraws.translate( 0 + (this.cameraOffsetX ?? 0), 0 + (this.cameraOffsetY ?? 0) )
      /*
      end to optimize
       */
      await page.render({
        canvasContext: context,
        viewport,
      }).promise
    },
    handleEvent(event) {
        this.$emit(
          'canvasEvent',
          event,
          event.target.attributes.getNamedItem('page').value
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
  // watch: {
  //   scale: function (val) {
  //     this.render()
  //   }
  // }
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
