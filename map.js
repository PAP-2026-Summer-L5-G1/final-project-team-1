const cards = document.querySelectorAll(".resource-card");


const currentCheck = JSON.parse(
    localStorage.getItem("savedResources") || "[]"
);
const savedIds = new Set();

savedResources.forEach(function (resource) {
  savedIds.add(resource.id);
});

let showingSaved = false;

function updateCards() {
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    let shouldShow = true;

    if (
      activeFilter !== "all" &&
      card.dataset.type !== activeFilter
    ) {
      shouldShow = false;
    }

    if (
      showingSaved === true &&
      !savedIds.has(card.dataset.id)
    ) {
      shouldShow = false;
    }
    if (
      currentCheck &&
      currentCheck.result &&
      currentCheck.result.tags.length > 0
    ) {
      let hasRecommendedTag = false;
      const cardTags = card.dataset.tags || "";

      for (
        let j = 0;
        j < currentCheck.result.tags.length;
        j++
      ) {
        const tag = currentCheck.result.tags[j];

        if (cardTags.includes(tag)) {
          hasRecommendedTag = true;
        }
      }

      if (hasRecommendedTag === false) {
        shouldShow = false;
      }
    }
    card.hidden = !shouldShow;
  }
}