import React, { useState, useEffect } from 'react';
import { cartStore, loadStores } from '../../js/stores/react/zustand/index.js';

function ShopDemo() {
  const [cart, setCart] = useState({ items: [] });
  const [isMounted, setIsMounted] = useState(false);

  const shopItems = [
    { id: 1, name: 'Wireless Mouse', price: 29.99 },
    { id: 2, name: 'Mechanical Keyboard', price: 79.99 },
    { id: 3, name: 'USB-C Hub', price: 49.99 },
    { id: 4, name: 'Monitor Stand', price: 39.99 }
  ];

  useEffect(() => {
    let unsubscribe;

    const init = async () => {
      await loadStores();
      setCart(cartStore.getState());
      unsubscribe = cartStore.subscribe(state => setCart(state));
      setIsMounted(true);
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (!isMounted) return null;

  return (
    <section className="shop-demo">
      <h2>🛍️ Mini Shop Demo</h2>
      <div className="store">
        <div className="items">
          <h3>🛒 Items</h3>
          {shopItems.map(item => (
            <div key={item.id} className="item">
              <span>{item.name} — ${item.price.toFixed(2)}</span>
              <button onClick={() => cartStore.getState().addItem(item)}>Add</button>
            </div>
          ))}
        </div>

        <div className="cart">
          <h3>🧺 Cart</h3>
          {cart.items.length > 0 ? (
            <>
              {cart.items.map(item => (
                <div key={item.id} className="item">
                  <span>{item.name} × {item.qty}</span>
                  <button onClick={() => cartStore.getState().removeItem(item.id)}>Remove</button>
                </div>
              ))}
              <button className="clear" onClick={() => cartStore.getState().clear()}>Clear Cart</button>
              <div className="total">💰 Total: ${cartStore.getState().getTotal().toFixed(2)}</div>
            </>
          ) : (
            <div>No items in cart</div>
          )}
        </div>
      </div>
    </section>
  );
}

export default ShopDemo;