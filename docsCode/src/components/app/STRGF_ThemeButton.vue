<script setup>
import { onMounted, ref, watchEffect } from 'vue';
import { appStore } from '../../js/stores/app/index.js';

// ------------------------------------------------------------------------------------------------

const isMounted = ref(false);

// ------------------------------------------------------------------------------------------------

function toggleTheme() {
  if (appStore.mode === 'dark') {
    appStore.mode = 'light';
    document.body.classList.remove('dark');
  } else {
    appStore.mode = 'dark';
    document.body.classList.add('dark');
  }
}

// ------------------------------------------------------------------------------------------------

onMounted(async () => {
  try {
  } catch (error) {
    console.error(error);
  } finally {
    isMounted.value = true;
  }
});

// ------------------------------------------------------------------------------------------------

watchEffect(() => {
  if (!isMounted.value || !appStore) return;
  if (appStore.mode === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
});

</script>

<template>

  <button @click="toggleTheme" v-if="isMounted" class="theme-toggle-button">

    <div v-if="appStore.mode !== 'dark'" class="icon-wrapper sun-glow">
      <div class="glow-circle" />
      <svg class="rise-animation" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
        fill="none" stroke="#FACC15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    </div>

    <div v-else class="icon-wrapper moon-glow">
      <div class="glow-circle" />
      <svg class="rise-animation" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
        fill="none" stroke="#3999F9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </div>
  </button>

</template>

<style scoped>
.theme-toggle-button {
  cursor: pointer;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  outline: none;
}

/* Icon wrapper with positioning context */
.icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Glowing background circle */
.glow-circle {
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 9999px;
  opacity: 0.7;
  filter: blur(22px);
  z-index: 0;
  animation: glowFade 1s ease-out forwards;
}

/* Glow colors for each mode */
.sun-glow .glow-circle {
  background-color: #FACC15;
}

.moon-glow .glow-circle {
  background-color: #3B82F6;
}

/* Rising icon animation */
.rise-animation {
  animation: riseIn 0.5s ease-out forwards;
  transform: translateY(8px) scale(0.8);
  opacity: 0;
  z-index: 1;
}

/* Rising icon keyframes */
@keyframes riseIn {
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* Glow keyframes: flares then fades away */
@keyframes glowFade {
  0% {
    transform: scale(0.4);
    opacity: 0.8;
  }

  60% {
    transform: scale(1);
    opacity: 1;
  }

  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}
</style>
