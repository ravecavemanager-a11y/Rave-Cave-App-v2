const STATE = {
  event: null,
  timetable: [],
  djMap: {}
};

let toastTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  bindEvents();
  await fetchData();
  setInterval(updateNowPlaying, CONFIG.AUTO_REFRESH_INTERVAL);
}

function bindEvents() {
  document
    .getElementById("modal-close")
    .addEventListener("click", closeBottomSheet);

  document
    .getElementById("sheet-overlay")
    .addEventListener("click", closeBottomSheet);
}

async function fetchData() {
  try {
    showLoading(true);

    const response = await fetch(
      CONFIG.GAS_API_URL
    );

    if (!response.ok) {
      throw new Error("API Error");
    }

    const data =
      await response.json();

    STATE.event = data.event || null;

    STATE.timetable =
      data.timetable || [];

    STATE.djMap = {};

    (data.djs || []).forEach(dj => {
      STATE.djMap[dj.dj_id] = dj;
    });

    STATE.timetable.sort((a, b) => {
      return (
        timeToMinutes(a.start_time) -
        timeToMinutes(b.start_time)
      );
    });

    renderEventInfo();
    renderTimetable();
    renderLineup();
    updateNowPlaying();

    showLoading(false);
  }
  catch (error) {

    console.error(error);

    showLoading(false);

    document
      .getElementById("error-message")
      .classList.remove("hidden");
  }
}

function renderEventInfo() {

  if (
    !STATE.event ||
    !STATE.event.title
  ) {

    document.getElementById(
      "event-title"
    ).textContent = "RAVE CAVE";

    document.getElementById(
      "event-date"
    ).textContent =
      "NEXT EVENT COMING SOON";

    document.getElementById(
      "event-time"
    ).textContent = "";

    return;
  }

  document.getElementById(
    "event-title"
  ).textContent =
    STATE.event.title;

  document.getElementById(
    "event-date"
  ).textContent =
    STATE.event.date;

  document.getElementById(
    "event-time"
  ).textContent =
    `${STATE.event.start_time} - ${STATE.event.end_time}`;
}

function timeToMinutes(timeString) {

  const [h, m] =
    timeString
      .split(":")
      .map(Number);

  let total =
    h * 60 + m;

  if (h < 12) {
    total += 1440;
  }

  return total;
}

function getCurrentMinutes() {

  const now = new Date();

  let total =
    now.getHours() * 60 +
    now.getMinutes();

  if (now.getHours() < 12) {
    total += 1440;
  }

  return total;
}

function clearTimetableHighlight() {
  document
    .querySelectorAll(".tt-item")
    .forEach(el => {

      el.classList.remove(
        "current"
      );

      const badge =
        el.querySelector(
          ".tt-now"
        );

      if (badge) {
        badge.textContent = "";
      }
    });
}

function updateNowPlaying() {

  const card =
    document.getElementById(
      "now-playing-card"
    );

  const imageContainer =
    document.getElementById(
      "now-playing-image-container"
    );

  const name =
    document.getElementById(
      "now-playing-name"
    );

  const time =
    document.getElementById(
      "now-playing-time"
    );

  // 状態が変わるたびにタイムテーブルのハイライトと
  // カードのクリックハンドラを毎回リセットしてから判定する
  clearTimetableHighlight();
  card.onclick = null;

  if (
    !STATE.event ||
    !STATE.event.title
  ) {

    imageContainer.innerHTML =
      '<div class="no-image">NO IMAGE</div>';

    name.textContent =
      "NEXT EVENT COMING SOON";

    time.textContent = "";

    return;
  }

  const now =
    getCurrentMinutes();

  const start =
    timeToMinutes(
      STATE.event.start_time
    );

  const end =
    timeToMinutes(
      STATE.event.end_time
    );

  if (now < start) {

    imageContainer.innerHTML =
      '<div class="no-image">NO IMAGE</div>';

    name.textContent =
      "EVENT STARTS SOON";

    time.textContent = "";

    return;
  }

  if (now >= end) {

    imageContainer.innerHTML =
      '<div class="no-image">NO IMAGE</div>';

    name.textContent =
      "EVENT ENDED";

    time.textContent = "";

    return;
  }

  let currentSlot = null;

  for (const item of STATE.timetable) {

    const itemStart =
      timeToMinutes(
        item.start_time
      );

    const itemEnd =
      timeToMinutes(
        item.end_time
      );

    if (
      now >= itemStart &&
      now < itemEnd
    ) {

      currentSlot = item;
      break;
    }
  }

  if (!currentSlot) {

    imageContainer.innerHTML =
      '<div class="no-image">NO IMAGE</div>';

    name.textContent =
      "NO DJ SCHEDULED";

    time.textContent = "";

    return;
  }

  const dj =
    STATE.djMap[
      currentSlot.dj_id
    ];

  renderImage(
    imageContainer,
    dj?.image_url
  );

  name.textContent =
    dj?.name ||
    currentSlot.dj_id;

  time.textContent =
    `${currentSlot.start_time} - ${currentSlot.end_time}`;

  card.onclick = () => {
    openBottomSheet(
      currentSlot.dj_id
    );
  };

  const currentRow =
    document.querySelector(
      `[data-start="${currentSlot.start_time}"]`
    );

  if (currentRow) {

    currentRow.classList.add(
      "current"
    );

    const badge =
      currentRow.querySelector(
        ".tt-now"
      );

    if (badge) {
      badge.textContent =
        "● NOW";
    }
  }
}

function renderTimetable() {

  const container =
    document.getElementById(
      "timetable-list"
    );

  container.innerHTML = "";

  STATE.timetable.forEach(item => {

    const dj =
      STATE.djMap[
        item.dj_id
      ];

    const button =
      document.createElement(
        "button"
      );

    button.className =
      "tt-item";

    button.type =
      "button";

    button.dataset.start =
      item.start_time;

    button.innerHTML = `
      <span class="tt-range">
        ${item.start_time} - ${item.end_time}
      </span>

      <span class="tt-name">
        ${dj?.name || item.dj_id}
      </span>

      <span class="tt-now"></span>
    `;

    button.addEventListener(
      "click",
      () => {
        openBottomSheet(
          item.dj_id
        );
      }
    );

    container.appendChild(
      button
    );
  });
}

function renderLineup() {

  const container =
    document.getElementById(
      "dj-list"
    );

  container.innerHTML = "";

  const rendered =
    new Set();

  STATE.timetable.forEach(item => {

    if (
      rendered.has(
        item.dj_id
      )
    ) {
      return;
    }

    rendered.add(
      item.dj_id
    );

    const dj =
      STATE.djMap[
        item.dj_id
      ];

    const card =
      document.createElement(
        "button"
      );

    card.className =
      "dj-card";

    card.type =
      "button";

    const image =
      document.createElement(
        "div"
      );

    image.className =
      "dj-image";

    renderImage(
      image,
      dj?.image_url
    );

    const name =
      document.createElement(
        "div"
      );

    name.className =
      "dj-name";

    name.textContent =
      dj?.name ||
      item.dj_id;

    card.appendChild(image);
    card.appendChild(name);

    card.addEventListener(
      "click",
      () => {
        openBottomSheet(
          item.dj_id
        );
      }
    );

    container.appendChild(card);
  });
}

function openBottomSheet(djId) {

  const dj =
    STATE.djMap[djId];

  if (!dj) {
    return;
  }

  document
    .getElementById(
      "bottom-sheet"
    )
    .classList.remove(
      "hidden"
    );

  document
    .getElementById(
      "modal-name"
    )
    .textContent =
    dj.name;

  const sns =
    document.getElementById(
      "modal-sns"
    );

  sns.innerHTML = "";

  renderImage(
    document.getElementById(
      "modal-img"
    ),
    dj.image_url
  );

  renderSNSCards(dj);
}

function closeBottomSheet() {

  document
    .getElementById(
      "bottom-sheet"
    )
    .classList.add(
      "hidden"
    );
}

function renderSNSCards(dj) {

  const container =
    document.getElementById(
      "modal-sns"
    );

  const snsList = [
    {
      name: "Instagram",
      id: dj.instagram_id,
      url: `https://instagram.com/${cleanId(dj.instagram_id)}`
    },
    {
      name: "TikTok",
      id: dj.tiktok_id,
      url: `https://tiktok.com/@${cleanId(dj.tiktok_id)}`
    },
    {
      name: "X",
      id: dj.x_id,
      url: `https://x.com/${cleanId(dj.x_id)}`
    },
    {
      name: "SoundCloud",
      id: dj.soundcloud_id,
      url: `https://soundcloud.com/${cleanId(dj.soundcloud_id)}`
    }
  ];

  snsList.forEach(sns => {

    if (!sns.id) {
      return;
    }

    const card =
      document.createElement(
        "div"
      );

    card.className =
      "sns-card";

    card.innerHTML = `
      <div class="sns-title">
        ${sns.name}
      </div>

      <div class="sns-id-row">

        <span class="sns-id">
          ${sns.id}
        </span>

        <button
          type="button"
          class="copy-btn"
        >
          COPY
        </button>

      </div>

      <a
        href="${sns.url}"
        class="open-btn"
        target="_blank"
        rel="noopener noreferrer"
      >
        OPEN ${sns.name.toUpperCase()}
      </a>
    `;

    card
      .querySelector(".copy-btn")
      .addEventListener(
        "click",
        () => {
          copyText(`@${cleanId(sns.id)}`);
        }
      );

    container.appendChild(card);
  });
}

function copyText(text) {

  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast(
          "Copied!"
        );
      });

    return;
  }

  const textarea =
    document.createElement(
      "textarea"
    );

  textarea.value = text;

  document.body.appendChild(
    textarea
  );

  textarea.select();

  document.execCommand(
    "copy"
  );

  textarea.remove();

  showToast(
    "Copied!"
  );
}

function showToast(message) {

  const toast =
    document.getElementById(
      "toast"
    );

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(() => {

      toast.classList.remove(
        "show"
      );

    }, 1500);
}

function cleanId(id) {

  return String(id || "")
    .replace(/^@+/, "")
    .trim();
}

function renderImage(
  container,
  imageUrl
) {

  container.innerHTML = "";

  if (
    !imageUrl ||
    !imageUrl.trim()
  ) {

    container.innerHTML =
      '<div class="no-image">NO IMAGE</div>';

    return;
  }

  const img =
    document.createElement(
      "img"
    );

  img.src =
    imageUrl;

  img.alt =
    "DJ Image";

  img.onerror = () => {

    container.innerHTML =
      '<div class="no-image">NO IMAGE</div>';
  };

  container.appendChild(img);
}

function showLoading(show) {

  const loading =
    document.getElementById(
      "loading-msg"
    );

  if (show) {

    loading.classList.remove(
      "hidden"
    );

  } else {

    loading.classList.add(
      "hidden"
    );
  }
}
