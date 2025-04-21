<script setup>
import { onMounted } from 'vue';
import { animate } from 'animejs';

// ------------------------------------------------------------------------------------------------

onMounted(() => {
  animate('#strf-title span', {
    // Property keyframes
    y: [
      { to: '-2.75rem', ease: 'outExpo', duration: 600 },
      { to: 0, ease: 'outBounce', duration: 800, delay: 100 }
    ],
    // Property specific parameters
    rotate: {
      from: '-1turn',
      delay: 0
    },
    delay: (_, i) => i * 50, // Function based value
    ease: 'inOutCirc',
    loopDelay: 30000,
    loop: true
  });
});
</script>

<template>
  <div id="strf-title">
    <!-- Loop through the letters and assign refs to each span -->
    <span v-for="(letter, index) in ['S', 'T', 'O', 'R', 'A', 'G', 'E', 'F', 'Y']" :key="index" ref="spanRefs">{{ letter
      }}</span>
  </div>
</template>

<style scoped>
#strf-title {
  display: flex;
  font-size: 2rem;
  font-weight: bold;
}

#strf-title span {
  display: inline-block;
  margin: 0 0.25rem;
  position: relative;
}
</style>