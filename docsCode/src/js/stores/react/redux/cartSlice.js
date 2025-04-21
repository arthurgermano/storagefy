import { createSlice } from "@reduxjs/toolkit";

// Initial state structure
const initialState = {
  items: [],
};

// Redux slice for cart
const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    setItems(state, action) {
      state.items = action.payload;
    },
    addItem(state, action) {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) {
        existing.qty++;
      } else {
        state.items.push({ ...action.payload, qty: 1 });
      }
    },
    removeItem(state, action) {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
    clear(state) {
      state.items = [];
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      (action) => action.type === "SET_STATE_FROM_STORAGE",
      (state, action) => {
        if (action.payload?.items) {
          state.items = action.payload.items;
        } else if (action.payload.cart?.items) {
          state.items = action.payload.cart.items;
        } else {
          state.items = [];
        }
      }
    )
    .addMatcher(
      (action) => action.type === "STORAGEFY_UPDATE",
      (state, action) => {
        const payload = action.payload;
        delete payload.STORAGEFY_SILENT_CHANNEL_UPDATE;
        if (payload?.cart?.items) {
          state.items = payload.cart.items;
        } else if (payload?.items) {
          state.items = payload.items;
        } else {
          state.items = [];
        }
      }
    );
  },
});

export const { setItems, addItem, removeItem, clear } = cartSlice.actions;
export default cartSlice.reducer;
