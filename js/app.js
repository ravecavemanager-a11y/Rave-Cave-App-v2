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

// dj_idを分解する。"Kaleido,Riku" のようにカンマ区切りで
// 複数人入力されている場合（B2B等）は配列で返す。
// 通常の単独DJの場合は要素数1の配列になる。
function parseDjIds(djIdString) {

  return String(djIdString || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
}

// dj_idから表示用の名前を作る。
// 複数人の場合は "Aさん × Bさん" の形式で連結する。
function getComboDisplayName(djIdString) {

  const ids = parseDjIds(djIdString);

  if (ids.length === 0) {
    return djIdString;
  }

  return ids
    .map(id => STATE.djMap[id]?.name || id)
    .join(" × ");
}

// NOW PLAYINGカードの画像欄に、複数DJの画像を
// 横並びで表示する（1人の場合は通常のrenderImageと同じ見た目）
function renderComboImage(container, djIdString) {

  const ids = parseDjIds(djIdString);

  if (ids.length <= 1) {

    const dj =
      STATE.djMap[djIdString];

    renderImage(
      container,
      dj?.image_url
    );

    return;
  }

  container.innerHTML = "";

  const row =
    document.createElement(
      "div"
    );

  row.className =
    "combo-image-row";

  ids.forEach(id => {

    const cell =
      document.createElement(
        "div"
      );

    cell.className =
      "combo-image-cell";

    const dj =
      STATE.djMap[id];

    renderImage(
      cell,
      dj?.image_url
    );

    row.appendChild(cell);
  });

  container.appendChild(row);
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

  renderComboImage(
    imageContainer,
    currentSlot.dj_id
  );

  name.textContent =
    getComboDisplayName(
      currentSlot.dj_id
    );

  time.textContent =
    `${currentSlot.start_time} - ${currentSlot.end_time}`;

  card.onclick = () => {
    openBottomSheet(
      currentSlot.dj_id
    );
  };

  const currentIndex =
    STATE.timetable.indexOf(
      currentSlot
    );

  const currentRow =
    document.querySelector(
      `[data-index="${currentIndex}"]`
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

  if (STATE.timetable.length === 0) {

    container.innerHTML =
      '<p class="empty-message">Timetable will be announced soon.</p>';

    return;
  }

  STATE.timetable.forEach((item, index) => {

    const button =
      document.createElement(
        "button"
      );

    button.className =
      "tt-item";

    button.type =
      "button";

    button.dataset.index =
      index;

    button.innerHTML = `
      <span class="tt-range">
        ${item.start_time} - ${item.end_time}
      </span>

      <span class="tt-name">
        ${getComboDisplayName(item.dj_id)}
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

  if (STATE.timetable.length === 0) {

    container.innerHTML =
      '<p class="empty-message">Lineup will be announced soon.</p>';

    return;
  }

  const rendered =
    new Set();

  STATE.timetable.forEach(item => {

    parseDjIds(item.dj_id).forEach(djId => {

      if (
        rendered.has(
          djId
        )
      ) {
        return;
      }

      rendered.add(
        djId
      );

      const dj =
        STATE.djMap[
          djId
        ];

      container.appendChild(
        createDjCard(djId, dj)
      );
    });
  });
}

function renderAllDjs() {

  const container =
    document.getElementById(
      "all-dj-list"
    );

  container.innerHTML = "";

  // 当日のタイムテーブルに載っているDJ IDの集合
  // （B2B等のコンボは中身の個々のdj_idまで展開する）
  const todaysDjIds =
    new Set();

  STATE.timetable.forEach(item => {

    parseDjIds(item.dj_id).forEach(djId => {
      todaysDjIds.add(djId);
    });
  });

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

function openBottomSheet(djIdString) {

  const ids =
    parseDjIds(djIdString);

  // 誰も djs マスタに存在しなければ何もしない
  const validIds =
    ids.filter(id => STATE.djMap[id]);

  if (validIds.length === 0) {
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
    getComboDisplayName(djIdString);

  renderComboImage(
    document.getElementById(
      "modal-img"
    ),
    djIdString
  );

  const sns =
    document.getElementById(
      "modal-sns"
    );

  sns.innerHTML = "";

  if (validIds.length === 1) {

    // ソロDJの場合は今まで通りのシンプルな表示
    const hasAny =
      appendDjSnsCards(
        sns,
        STATE.djMap[validIds[0]]
      );

    if (!hasAny) {

      sns.innerHTML =
        '<p class="empty-message">No social links yet.</p>';
    }

    return;
  }

  // B2B等、複数人の場合はメンバーごとにセクションを分けて表示
  validIds.forEach(id => {

    const dj =
      STATE.djMap[id];

    const block =
      document.createElement(
        "div"
      );

    block.className =
      "member-block";

    const heading =
      document.createElement(
        "div"
      );

    heading.className =
      "member-heading";

    heading.textContent =
      dj.name || id;

    block.appendChild(heading);

    sns.appendChild(block);

    const hasAny =
      appendDjSnsCards(block, dj);

    if (!hasAny) {

      const empty =
        document.createElement(
          "p"
        );

      empty.className =
        "empty-message";

      empty.textContent =
        "No social links yet.";

      block.appendChild(empty);
    }
  });
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

// 指定したコンテナに、1人分のDJのSNSカードを追加する。
// コンテナのクリアは呼び出し側の責任（ソロ用・コンボ用の両方から再利用するため）。
// 戻り値: 1件でもリンクを追加できたか（true/false）
function appendDjSnsCards(container, dj) {

  const snsList = [
    {
      name: "Instagram",
      id: dj.instagram_id,
      url: `https://instagram.com/${cleanId(dj.instagram_id)}`,
      isDirectUrl: false
    },
    {
      name: "TikTok",
      id: dj.tiktok_id,
      url: `https://tiktok.com/@${cleanId(dj.tiktok_id)}`,
      isDirectUrl: false
    },
    {
      name: "X",
      id: dj.x_id,
      url: `https://x.com/${cleanId(dj.x_id)}`,
      isDirectUrl: false
    },
    {
      name: "SoundCloud",
      id: dj.soundcloud_id,
      url: `https://soundcloud.com/${cleanId(dj.soundcloud_id)}`,
      isDirectUrl: false
    },
    {
      // others列はID断片ではなく完全なURLがそのまま入っている
      // （YouTube、Spotify、公式サイト、Linktreeなど自由なリンク）
      name: "Link",
      id: dj.others,
      url: dj.others,
      isDirectUrl: true
    }
  ];

  const availableSns =
    snsList.filter(sns => sns.id);

  availableSns.forEach(sns => {

    const card =
      document.createElement(
        "div"
      );

    card.className =
      "sns-card";

    // 直URL(others)は生のIDではなく、
    // 見やすい案内文を表示する
    const displayText =
      sns.isDirectUrl
        ? "Tap OPEN to visit"
        : sns.id;

    card.innerHTML = `
      <div class="sns-title">
        ${sns.name}
      </div>

      <div class="sns-id-row">

        <span class="sns-id">
          ${displayText}
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

          // 直URL(others)はそのままコピー、
          // SNSのIDは@付きでコピー
          const textToCopy =
            sns.isDirectUrl
              ? sns.id
              : `@${cleanId(sns.id)}`;

          copyText(textToCopy);
        }
      );

    container.appendChild(card);
  });

  return availableSns.length > 0;
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
    .trim()
    .replace(/^@+/, "");
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
