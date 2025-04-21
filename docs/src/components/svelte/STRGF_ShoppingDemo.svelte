<script>
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { cartStore } from "../../js/stores/svelte/index.js";

  // Reactive variables
  const isMounted = writable(false);

  // Sample items
  const shopItems = [
    { id: 1, name: "Wireless Mouse", price: 29.99 },
    { id: 2, name: "Mechanical Keyboard", price: 79.99 },
    { id: 3, name: "USB-C Hub", price: 49.99 },
    { id: 4, name: "Monitor Stand", price: 39.99 },
  ];

  const addItem = (item) => {
    cartStore.update((state) => {
      const existing = state.items.find((i) => i.id === item.id);
      if (existing) {
        existing.qty++;
      } else {
        state.items.push({ ...item, qty: 1 });
      }
      return state;
    });
  };

  const removeItem = (id) => {
    cartStore.update((state) => {
      state.items = state.items.filter((i) => i.id !== id);
      return state;
    });
  };

  const clear = () => {
    cartStore.update((state) => {
      state.items = [];
      return state;
    });
  };

  onMount(async () => {
    try {
    } catch (error) {
      console.error(error);
    } finally {
      isMounted.set(true);
    }
  });
</script>

{#if $isMounted}
  <section class="shop-demo">
    <h2>🛍️ Mini Shop Demo</h2>
    <div class="store">
      <div class="items">
        <h3>🛒 Items</h3>
        {#each shopItems as item (item.id)}
          <div class="item">
            <span>{item.name} — ${item.price.toFixed(2)}</span>
            <button on:click={() => addItem(item)}>Add</button>
          </div>
        {/each}
      </div>

      <div class="cart">
        <h3>🧺 Cart</h3>
        {#if $cartStore?.items?.length}
          {#each $cartStore.items as item (item.id)}
            <div class="item">
              <span>{item.name} × {item.qty}</span>
              <button on:click={() => removeItem(item.id)}>Remove</button>
            </div>
          {/each}
          <button class="clear" on:click={clear}>Clear Cart</button>
        {:else}
          <div>No items in cart</div>
        {/if}
      </div>
    </div>
  </section>
{/if}
