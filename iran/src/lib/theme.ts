/** Saved choice of the viewer ("light" | "dark"); day mode when nothing is saved. */
export const THEME_KEY = "sh-theme";

/** Runs before the first paint (root layout): applies a saved night mode without a flash. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
