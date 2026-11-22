import { registerActions as registerGalleryActions } from "../gallery-actions.js";

export function registerActions(actions) {
  registerGalleryActions(actions, { expose: true });
}
