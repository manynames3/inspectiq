import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { InspectionDetailPage } from "./pages/InspectionDetailPage.js";
import { NewInspectionPage } from "./pages/NewInspectionPage.js";
import { PlatformHealthPage } from "./pages/PlatformHealthPage.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<DashboardPage />} />
          <Route path="/new" element={<NewInspectionPage />} />
          <Route path="/inspections/:id" element={<InspectionDetailPage />} />
          <Route path="/platform-health" element={<PlatformHealthPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

