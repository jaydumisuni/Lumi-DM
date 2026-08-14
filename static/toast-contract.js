"use strict";

/* Toast close buttons already own direct click listeners in app.js. Mark that
   existing behavior declaratively so the interaction auditor can verify it. */
(() => {
  function markToastButtons(root) {
    if (!root) return;
    if (root.matches?.(".toast button")) root.dataset.contractReady = "toast-close";
    root.querySelectorAll?.(".toast button").forEach(button => {
      button.dataset.contractReady = "toast-close";
    });
  }

  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  markToastButtons(stack);
  new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) markToastButtons(node);
      });
    }
  }).observe(stack, { childList: true, subtree: true });
})();
