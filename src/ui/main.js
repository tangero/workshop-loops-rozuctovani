import * as api from "../splitBill.js";
import { createApp } from "./app.js";

createApp(document.getElementById("app"), api, window.localStorage);
