import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  addItem,
  removeItem,
  clear,
} from "../../../js/stores/react/redux/cartSlice";
import { loadStores } from "../../../js/stores/react/redux/index.js";

export default function MiniShop() {
  const dispatch = useDispatch();
  const cartItems = useSelector((state) => state.cart.items);
  const [isMounted, setIsMounted] = useState(false);

  const shopItems = [
    { id: 1, name: "Wireless Mouse", price: 29.99 },
    { id: 2, name: "Mechanical Keyboard", price: 79.99 },
    { id: 3, name: "USB-C Hub", price: 49.99 },
    { id: 4, name: "Monitor Stand", price: 39.99 },
  ];

  useEffect(() => {
    const init = async () => {
      await loadStores();
      setIsMounted(true);
    };
    init();
  }, []);

  if (!isMounted) return null;

  return (
    <section className="shop-demo">
      <h2>🛍️ Mini Shop Demo</h2>
      <div className="store">
        <div className="items">
          <h3>🛒 Items</h3>
          {shopItems.map((item) => (
            <div key={item.id} className="item">
              <span>
                {item.name} — ${item.price.toFixed(2)}
              </span>
              <button onClick={() => dispatch(addItem(item))}>Add</button>
            </div>
          ))}
        </div>

        <div className="cart">
          <h3>🧺 Cart</h3>
          {cartItems.length ? (
            <>
              {cartItems.map((item) => (
                <div key={item.id} className="item">
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <button onClick={() => dispatch(removeItem(item.id))}>
                    Remove
                  </button>
                </div>
              ))}
              <button className="clear" onClick={() => dispatch(clear())}>
                Clear Cart
              </button>
            </>
          ) : (
            <div>No items in cart</div>
          )}
        </div>
      </div>
    </section>
  );
}