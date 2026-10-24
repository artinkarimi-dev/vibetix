import { ApiGate } from "./components/common/ApiGate";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/product.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ApiGate>
        <RouterProvider router={router} />
      </ApiGate>
    </AppErrorBoundary>
  </StrictMode>,
);
