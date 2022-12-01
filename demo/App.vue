<template>
  <div>
    <vue-pdf-embed
      :image-resources-path="annotationIconsPath"
      :source="pdfSource"
      :scale="scale"
      :page="2"
      :cameraOffsetX="cameraOffsetX"
      :cameraOffsetY="cameraOffsetY"
      :disableTextLayer="true"
      :disableAnnotationLayer="true"
      @canvasEvent="handleCanvasEvent"
    />
  </div>
</template>

<script>
import VuePdfEmbed from '../src/vue-pdf-embed.vue'

export default {
  components: {
    VuePdfEmbed,
  },
  data() {
    return {
      annotationIconsPath: '/node_modules/pdfjs-dist/web/images/',
      pdfSource: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf',
      scale: 1,
      timeout: null,
      debouncedInput: '',
      isDragging: false,
      initialPinchDistance: null,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
      dragStart: { x: 0, y: 0 }
    }
  },
  methods: {
    getEventLocation: function(e)
    {
      if (e.touches && e.touches.length == 1)
      {
        return { x:e.touches[0].clientX, y: e.touches[0].clientY }
      }
      else if (e.clientX && e.clientY)
      {
        return { x: e.clientX, y: e.clientY }
      }
    },
    onPointerDown: function (e) {
      this.isDragging = true,
      this.dragStart.x = this.getEventLocation(e).x - this.cameraOffsetX
      this.dragStart.y = this.getEventLocation(e).y - this.cameraOffsetY
    },
    onPointerUp: function(e)
    {
      this.isDragging = false
      this.initialPinchDistance = null
    },
    onPointerMove: function(e)
    {
      if (this.isDragging)
      {
        this.cameraOffsetX = this.getEventLocation(e).x - this.dragStart.x
        this.cameraOffsetY = this.getEventLocation(e).y - this.dragStart.y
      }
    },
    handleTouch: function (e, singleTouchHandler)
    {
      if ( e.touches?.length == 1 )
      {
        singleTouchHandler(e)
      }
      // else if (e.type == "touchmove" && e.touches.length == 2)
      // {
      //   this.isDragging = false
      //   handlePinch(e)
      // }
    },
    // handlePinch: function (e)
    // {
    //   e.preventDefault()
    //
    //   let touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    //   let touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY }
    //
    //   // This is distance squared, but no need for an expensive sqrt as it's only used in ratio
    //   let currentDistance = (touch1.x - touch2.x)**2 + (touch1.y - touch2.y)**2
    //
    //   if (this.initialPinchDistance == null)
    //   {
    //     this.initialPinchDistance = currentDistance
    //   }
    //   else
    //   {
    //     adjustZoom( null, currentDistance/initialPinchDistance )
    //   }
    // },
    handleCanvasEvent: function (event, page) {
      //console.log('handleCanvasEvent : ', event, page);
      if ( event.type === 'wheel'){
        let scale = this.scale.valueOf()
        if (event.deltaY < 0)
        {
          console.log('wheel up');
          scale = scale + .2;
        }
        else if (event.deltaY > 0)
        {
          console.log('wheel down');
          scale = scale - .2;
          if (scale < 1) {
            scale = 1;
          }
        }
        if (this.timeout) clearTimeout(this.timeout)
        this.timeout = setTimeout(() => {
          console.log("yeah", this.scale, scale)

          this.scale = scale
        }, 300)
        event.preventDefault();
      }
      if ( event.type === 'mousedown' ) {
        this.onPointerDown(event)
      }
      if ( event.type === 'touchstart' ) {
        this.handleTouch(event, this.onPointerDown)
      }
      if ( event.type === 'mouseup' ) {
        this.onPointerUp(event)
      }
      if ( event.type === 'touchend' ) {
        this.handleTouch(event, this.onPointerUp)
      }
      if ( event.type === 'mousemove' ) {
        if (this.timeout) clearTimeout(this.timeout)
        this.timeout = setTimeout(() => {
          this.onPointerMove(event)
        }, 30)

      }
      if ( event.type === 'touchmove' ) {
        if (this.timeout) clearTimeout(this.timeout)
        this.timeout = setTimeout(() => {
          this.handleTouch(event, this.onPointerMove)
        }, 30)
      }
    }
  }
}
</script>

<style lang="scss">
body {
  padding: 16px;
  background-color: #ccc;
}

.vue-pdf-embed {
  margin: auto;
  max-width: 480px;

  & > div {
    margin-bottom: 4px;
    box-shadow: 0 2px 8px 4px rgba(0, 0, 0, 0.1);
  }
}
</style>
