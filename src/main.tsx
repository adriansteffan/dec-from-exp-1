import React from "react";
import ReactDOM from "react-dom/client";
import Experiment from "./Experiment";
import "./index.css";
import { ExperimentProvider } from "@adriansteffan/reactive";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ExperimentProvider disableSettings={import.meta.env.VITE_DISABLE_SETTINGS} disableHybridSimulation={!!import.meta.env.VITE_DISABLE_HYBRID_SIMULATION}>
      <Experiment />
    </ExperimentProvider>
  </React.StrictMode>
);