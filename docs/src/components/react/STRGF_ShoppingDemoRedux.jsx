// MiniShopWrapper.jsx or wherever you render it
import React from "react";
import { Provider } from "react-redux";
import { cartStore } from "../../js/stores/react/redux/index.js";
import MiniShop from "./redux/Minishop";

export default function MiniShopWrapper() {
  return (
    <Provider store={cartStore}>
      <MiniShop />
    </Provider>
  );
}
