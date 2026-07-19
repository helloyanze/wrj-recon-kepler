import React from "react";
import ReactDOM from "react-dom/client";
import {Provider} from "react-redux";
import App from "./App";
import {createAppStore} from "./app/store";
import "./index.css";

const debugMode = import.meta.env.VITE_WRJ_KEPLER_DEBUG === "true";
const store = createAppStore(debugMode);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App debugMode={debugMode} />
    </Provider>
  </React.StrictMode>
);
