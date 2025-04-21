<script setup>
import { onMounted, ref } from 'vue';
import { cartStore } from '../../js/stores/vue/index.js';

// ------------------------------------------------------------------------------------------------

const isMounted = ref(false);

// ------------------------------------------------------------------------------------------------

// Sample items
const shopItems = [
  { id: 1, name: 'Wireless Mouse', price: 29.99 },
  { id: 2, name: 'Mechanical Keyboard', price: 79.99 },
  { id: 3, name: 'USB-C Hub', price: 49.99 },
  { id: 4, name: 'Monitor Stand', price: 39.99 }
];

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
</script>

<template>
  <section class="shop-demo" v-if="isMounted">
    <h2>🛍️ Mini Shop Demo</h2>
    <div class="store">
      <div class="items">
        <h3>🛒 Items</h3>
        <div v-for="item in shopItems" :key="item.id" class="item">
          <span>{{ item.name }} — ${{ item.price.toFixed(2) }}</span>
          <button @click="cartStore.addItem(item)">Add</button>
        </div>
      </div>

      <div class="cart">
        <h3>🧺 Cart</h3>
        <div v-if="cartStore.items.length">
          <div v-for="item in cartStore.items" :key="item.id" class="item">
            <span>{{ item.name }} × {{ item.qty }}</span>
            <button @click="cartStore.removeItem(item.id)">Remove</button>
          </div>
          <button class="clear" @click="cartStore.clear()">Clear Cart</button>
        </div>
        <div v-else>No items in cart</div>
      </div>
    </div>
  </section>
</template>
