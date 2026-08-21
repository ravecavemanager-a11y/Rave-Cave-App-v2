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

    // イベントの開始日時を基準に、タイムテーブルを
    // 実際の日時順（深夜またぎも正しく考慮）で並び替える
    if (
      STATE.event &&
      STATE.event.date &&
      STATE.event.start_time
    ) {

      const eventStartForSort =
        buildDateTime(
          STATE.event.date,
          STATE.event.start_time
        );

      STATE.timetable.sort((a, b) => {

        const aStart =
          resolveDateTimeAfter(
            STATE.event.date,
            a.start_time,
            eventStartForSort
          );

        const bStart =
          resolveDateTimeAfter(
            STATE.event.date,
            b.start_time,
            eventStartForSort
          );

        return aStart - bStart;
      });

    } else {

      // アクティブなイベントが無い場合の保険（基準日時が無いため簡易判定）
      STATE.timetable.sort((a, b) => {
        return (
          timeToMinutes(a.start_time) -
          timeToMinutes(b.start_time)
        );
      });
    }

    renderEventInfo();
    renderTimetable();
    renderLineup();
    renderAllDjs();
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
      "STAY TUNED...";

    document.getElementById(
      "event-time"
    ).textContent = "";

    return;
  }

  document.getElementById(
    "event-title"
  ).textContent =
    STATE.event.title.toUpperCase();

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

// "yyyy-MM-dd" と "HH:mm" を組み合わせて
// 実際の日時（Dateオブジェクト）を作る
function buildDateTime(dateString, timeString) {

  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  const [hour, minute] =
    timeString
      .split(":")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0
  );
}

// イベント開始日時を基準に、深夜またぎ（例: 01:00）の
// 時刻を「翌日」として正しく解決する
function resolveDateTimeAfter(
  baseDateString,
  timeString,
  notBeforeDate
) {

  let dt =
    buildDateTime(
      baseDateString,
      timeString
    );

  if (dt < notBeforeDate) {

    dt = new Date(
      dt.getTime() +
      24 * 60 * 60 * 1000
    );
  }

  return dt;
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
      "STAY TUNED...";

    time.textContent = "";

    return;
  }

  const eventStart =
    buildDateTime(
      STATE.event.date,
      STATE.event.start_time
    );

  let eventEnd =
    buildDateTime(
      STATE.event.date,
      STATE.event.end_time
    );

  // 終了時刻が開始時刻以前 = 深夜またぎイベント
  // （例: 22:00開始 → 翌日04:00終了）
  if (eventEnd <= eventStart) {

    eventEnd = new Date(
      eventEnd.getTime() +
      24 * 60 * 60 * 1000
    );
  }

  const now = new Date();

  const ONE_HOUR_MS =
    60 * 60 * 1000;

  if (now < eventStart) {

    imageContainer.innerHTML =
      '<div class="no-image">NO IMAGE</div>';

    // 開始1時間前を切ったら EVENT STARTS SOON、
    // それより前は STAY TUNED...
    name.textContent =
      (eventStart - now) <= ONE_HOUR_MS
        ? "EVENT STARTS SOON"
        : "STAY TUNED...";

    time.textContent = "";

    return;
  }

  if (now >= eventEnd) {

    imageContainer.innerHTML =
      '<div class="no-image">NO IMAGE</div>';

    // 終了直後〜1時間以内は EVENT ENDED + Thank you for coming!、
    // それを過ぎたら次のイベントを待つ STAY TUNED...
    if ((now - eventEnd) < ONE_HOUR_MS) {

      name.innerHTML =
        "EVENT ENDED<br>Thank you for coming!";

    } else {

      name.textContent =
        "STAY TUNED...";
    }

    time.textContent = "";

    return;
  }

  let currentSlot = null;

  for (const item of STATE.timetable) {

    const itemStart =
      resolveDateTimeAfter(
        STATE.event.date,
        item.start_time,
        eventStart
      );

    let itemEnd =
      resolveDateTimeAfter(
        STATE.event.date,
        item.end_time,
        eventStart
      );

    if (itemEnd <= itemStart) {

      itemEnd = new Date(
        itemEnd.getTime() +
        24 * 60 * 60 * 1000
      );
    }

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

function createDjCard(djId, dj) {

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
    djId;

  card.appendChild(image);
  card.appendChild(name);

  card.addEventListener(
    "click",
    () => {
      openBottomSheet(
        djId
      );
    }
  );

  return card;
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

    container.appendChild(
      createDjCard(item.dj_id, dj)
    );
  });
}

function renderAllDjs() {

  const container =
    document.getElementById(
      "all-dj-list"
    );

  container.innerHTML = "";

  // 当日のタイムテーブルに載っているDJ IDの集合
  const todaysDjIds =
    new Set(
      STATE.timetable.map(
        item => item.dj_id
      )
    );

  const others =
    Object.keys(STATE.djMap)
      .filter(djId => !todaysDjIds.has(djId));

  if (others.length === 0) {

    container.innerHTML =
      '<p class="empty-message">All RAVE CAVE DJs are playing today!</p>';

    return;
  }

  others.forEach(djId => {

    const dj =
      STATE.djMap[djId];

    container.appendChild(
      createDjCard(djId, dj)
    );
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
