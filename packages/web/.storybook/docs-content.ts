export interface LocalizedDocText {
  readonly en: string;
  readonly ru: string;
}

export interface ComponentDocsContent {
  readonly description: LocalizedDocText;
  readonly props?: Readonly<Record<string, LocalizedDocText>>;
  readonly stories?: Readonly<Record<string, LocalizedDocText>>;
}

const text = (en: string, ru: string): LocalizedDocText => ({ en, ru });

export const docsPreviewText: Readonly<
  Record<"showPreview" | "hidePreview" | "onDemandHint", LocalizedDocText>
> = {
  showPreview: text("Show example", "Показать пример"),
  hidePreview: text("Hide example", "Скрыть пример"),
  onDemandHint: text(
    "Previews start hidden. Open one example at a time. Its dialog may cover this page; close it with its close button or Escape, then hide the example.",
    "Примеры изначально скрыты. Открывайте по одному. Диалог может перекрыть эту страницу; закройте его кнопкой закрытия или Escape, затем скройте пример.",
  ),
};

const common = {
  className: text(
    "Additional CSS classes for the component container.",
    "Дополнительные CSS-классы контейнера компонента.",
  ),
  children: text("Content rendered inside the component.", "Содержимое внутри компонента."),
  size: text("Visual size preset.", "Предустановленный размер компонента."),
  disabled: text(
    "Disables user interaction with the control.",
    "Отключает взаимодействие с элементом управления.",
  ),
  id: text(
    "DOM identifier used to associate labels and controls.",
    "Идентификатор DOM для связи подписей и элементов управления.",
  ),
  ariaLabel: text(
    "Accessible name for assistive technology.",
    "Доступное имя для вспомогательных технологий.",
  ),
  "aria-label": text(
    "Accessible name for assistive technology.",
    "Доступное имя для вспомогательных технологий.",
  ),
  ariaLabelledBy: text(
    "IDs of elements that provide the accessible name.",
    "Идентификаторы элементов, задающих доступное имя.",
  ),
  placeholder: text(
    "Hint displayed when the field is empty.",
    "Подсказка, отображаемая в пустом поле.",
  ),
  emptyText: text(
    "Message displayed when the option list is empty.",
    "Сообщение для пустого списка вариантов.",
  ),
  options: text(
    "Caller-supplied options with values, labels and optional descriptions or disabled states.",
    "Переданные вызывающим кодом варианты со значениями, подписями и необязательными описаниями или состоянием disabled.",
  ),
  onValueChange: text(
    "Called with the next controlled string value.",
    "Вызывается с новым строковым значением управляемого поля.",
  ),
  open: text(
    "Controlled visibility of the overlay.",
    "Управляемая видимость всплывающего элемента.",
  ),
  onOpenChange: text(
    "Requests a visibility change; the caller updates open.",
    "Запрашивает изменение видимости; вызывающий код обновляет open.",
  ),
  onClose: text(
    "Requests dismissal; the caller updates visibility.",
    "Запрашивает закрытие; вызывающий код обновляет видимость.",
  ),
  onClick: text("Called when the action is activated.", "Вызывается при активации действия."),
  inputClassName: text(
    "Additional CSS classes for the text input.",
    "Дополнительные CSS-классы текстового поля.",
  ),
  listClassName: text(
    "CSS classes controlling the list container and scrolling.",
    "CSS-классы контейнера списка и его прокрутки.",
  ),
  rowClassName: text(
    "CSS classes for each selectable row.",
    "CSS-классы каждой выбираемой строки.",
  ),
  query: text(
    "Caller-owned search query; filtering changes visibility only.",
    "Поисковый запрос, которым управляет вызывающий код; фильтрация меняет только видимость.",
  ),
  onQueryChange: text(
    "Called with the next search query.",
    "Вызывается с новым поисковым запросом.",
  ),
  queryPlaceholder: text(
    "Search-field hint and accessible name.",
    "Подсказка и доступное имя поискового поля.",
  ),
  emptyLabel: text(
    "Text shown when no options match the query.",
    "Текст, когда ни один вариант не соответствует запросу.",
  ),
  style: text(
    "Inline styles applied to the visual container.",
    "Встроенные стили визуального контейнера.",
  ),
};

export const docsContent: Readonly<Record<string, ComponentDocsContent>> = {
  "Shared/Actions/Button": {
    description: text(
      "Action button with shared appearance, size, loading and disabled states. Use a link for navigation; the caller owns the action and its availability.",
      "Кнопка действия с общими вариантами оформления, размера, загрузки и отключения. Для навигации используйте ссылку; действие и его доступность определяет вызывающий код.",
    ),
    props: {
      size: common.size,
      disabled: common.disabled,
      className: common.className,
      onClick: common.onClick,
      children: text(
        "Button label or content; icon-only actions still need an accessible name.",
        "Подпись или содержимое кнопки; кнопке только с иконкой также нужно доступное имя.",
      ),
      leadingIcon: text(
        "Optional icon before the label; loading replaces it with a spinner.",
        "Необязательная иконка перед подписью; при загрузке её заменяет индикатор.",
      ),
      loading: text(
        "Shows a spinner, marks the button busy and disables interaction.",
        "Показывает индикатор, отмечает кнопку как занятую и отключает взаимодействие.",
      ),
      fullWidth: text(
        "Expands the button to the available container width.",
        "Растягивает кнопку на доступную ширину контейнера.",
      ),
      variant: text(
        "Semantic action tone: primary, neutral or danger.",
        "Смысловой тон действия: primary, neutral или danger.",
      ),
      appearance: text(
        "Filled, outlined or ghost treatment of the selected tone.",
        "Заливка, контур или оформление ghost для выбранного тона.",
      ),
      type: text(
        "Native button type; use submit only for the intended form action.",
        "Нативный тип кнопки; submit используется для нужного действия формы.",
      ),
      "aria-busy": text(
        "Native busy state; loading sets it to true automatically.",
        "Нативное состояние занятости; loading автоматически устанавливает true.",
      ),
    },
  },
  "Shared/Actions/Copyable": {
    description: text(
      "Copy affordance using the application clipboard wrapper, with hover/focus and result feedback. Clicking writes the synthetic value to your clipboard; these stories do not automatically copy or prove browser/Electron clipboard integration.",
      "Элемент копирования через общий слой работы с буфером обмена, с показом при наведении/фокусе и сообщением о результате. Нажатие копирует демонстрационное значение; примеры не копируют автоматически и не подтверждают интеграцию буфера обмена браузера или Electron.",
    ),
    props: {
      className: common.className,
      value: text(
        "Exact text passed to the clipboard wrapper when clicked.",
        "Точный текст, передаваемый слою работы с буфером обмена при нажатии.",
      ),
      children: text(
        "Optional visible content next to the copy button.",
        "Необязательное видимое содержимое рядом с кнопкой копирования.",
      ),
      showOnHover: text(
        "Hides the button until hover or keyboard focus; success feedback remains visible briefly.",
        "Скрывает кнопку до наведения или клавиатурного фокуса; после успешного копирования она ненадолго остаётся видимой.",
      ),
      copyAriaLabel: text(
        "Accessible label before copying; success and failure use the existing localized feedback.",
        "Доступная подпись до копирования; после операции используются существующие локализованные сообщения об успехе или ошибке.",
      ),
      contentClassName: text(
        "Additional CSS classes for the supplied content.",
        "Дополнительные CSS-классы переданного содержимого.",
      ),
      buttonClassName: text(
        "Additional CSS classes for the copy button.",
        "Дополнительные CSS-классы кнопки копирования.",
      ),
      iconSize: text(
        "Copy/result icon size in pixels.",
        "Размер иконки копирования или результата в пикселях.",
      ),
    },
  },
  "Shared/Identity/Avatar": {
    description: text(
      "Visual avatar for supplied images or fallback initials, with optional presence and deactivated badges. Workspace user URNs, authenticated loading and domain data belong to WorkspaceAvatar.",
      "Визуальный аватар для переданного изображения или запасных инициалов, с необязательными значками присутствия и деактивации. WorkspaceAvatar отвечает за URN пользователя, авторизованную загрузку и предметные данные.",
    ),
    props: {
      size: common.size,
      className: common.className,
      style: common.style,
      src: text(
        "Image URL; missing, blank or failed images fall back to children.",
        "URL изображения; при отсутствии, пустой строке или ошибке загрузки отображается children.",
      ),
      imageLoading: text(
        "Native image loading hint: lazy or eager.",
        "Нативная подсказка загрузки изображения: lazy или eager.",
      ),
      interactive: text(
        "Adds a pointer cursor and a hover ring through a parent group; it does not create a click handler.",
        "Добавляет курсор pointer и кольцо при наведении на родительскую group; обработчик нажатия не создаёт.",
      ),
      presence: text(
        "Presence badge; omit or pass null to hide it. Offline still displays a badge.",
        "Значок присутствия; пропустите значение или передайте null, чтобы скрыть его. Offline также отображает значок.",
      ),
      deactivated: text(
        "Shows the deactivated-account badge instead of presence.",
        "Показывает значок деактивированной учётной записи вместо присутствия.",
      ),
      children: text(
        "Fallback initials or content when no usable image is available.",
        "Запасные инициалы или содержимое, когда подходящее изображение недоступно.",
      ),
    },
  },
  "Shared/Identity/Icon": {
    description: text(
      "Named SVG icons from the existing registry. Reuse a registry name before adding an asset; the caller supplies an accessible name for any action that uses a decorative icon.",
      "Именованные SVG-иконки существующего реестра. Перед добавлением нового ресурса проверьте реестр; доступное имя действия с декоративной иконкой задаёт вызывающий код.",
    ),
    props: {
      className: common.className,
      name: text("Existing icon registry name.", "Имя иконки в существующем реестре."),
      size: text("Icon width and height in pixels.", "Ширина и высота иконки в пикселях."),
    },
  },
  "Shared/Identity/PresenceIndicator": {
    description: text(
      "Static presence or deactivated-account badge using shared theme colors. This component presents a supplied status; it does not measure presence or fetch users.",
      "Статичный значок присутствия или деактивации с общими цветами темы. Компонент отображает переданный статус; он не определяет присутствие и не загружает пользователей.",
    ),
    props: {
      size: common.size,
      className: common.className,
      status: text(
        "Supplied visual presence status; null hides the dot unless deactivated is true.",
        "Переданный визуальный статус присутствия; null скрывает точку, если deactivated не равен true.",
      ),
      deactivated: text(
        "Replaces the presence dot with the deactivated-account mark.",
        "Заменяет точку присутствия значком деактивации.",
      ),
      withBorder: text(
        "Adds a background-colored ring around the presence dot; deactivated-badge styling is fixed.",
        "Добавляет вокруг точки присутствия кольцо цвета фона; оформление значка деактивации фиксировано.",
      ),
    },
  },
  "Shared/Feedback/Badge": {
    description: text(
      "Compact count and mention pills. This family includes Badge, MentionBadge and UnreadCountBadge; callers own unread and mention policy.",
      "Компактные значки количества и упоминаний. Семейство включает Badge, MentionBadge и UnreadCountBadge; правила непрочитанного и упоминаний остаются у вызывающего кода.",
    ),
    props: {
      size: common.size,
      className: common.className,
      count: text(
        "Displayed count; this primitive does not calculate or cap it.",
        "Отображаемое количество; примитив не вычисляет и не ограничивает его.",
      ),
      variant: text(
        "Shared background treatment for unread or muted counts.",
        "Общее оформление фона для unread или muted.",
      ),
      rounded: text(
        "Pill or rounded-rectangle shape.",
        "Форма капсулы или прямоугольника со скруглёнными углами.",
      ),
      textTone: text(
        "Uses the badge text tone or the primary text tone.",
        "Использует цвет текста значка или основной цвет текста.",
      ),
    },
  },
  "Shared/Feedback/ErrorBoundary": {
    description: text(
      "Error containment for rendered children, with page/widget fallbacks and PageLoader. These examples show healthy boundaries and fallback presentation without throwing or sending telemetry; module tests cover capture and recovery.",
      "Граница обработки ошибок дочернего UI, с заглушками страницы/виджета и PageLoader. Примеры показывают исправные границы и оформление ошибок без выбрасывания исключений и отправки телеметрии; перехват и восстановление проверяются тестами модуля.",
    ),
    props: {
      children: common.children,
      fallback: text(
        "Replacement content or a render function receiving the error and resetErrorBoundary.",
        "Замещающее содержимое или функция рендера, получающая error и resetErrorBoundary.",
      ),
      onError: text(
        "Called with the caught error and React error info after the existing logging/capture path.",
        "Вызывается с перехваченной ошибкой и сведениями React после существующего пути логирования и регистрации ошибки.",
      ),
    },
    stories: {
      PageFallback: text(
        "PageErrorFallback shows the page-level retry affordance with a synthetic callback.",
        "PageErrorFallback показывает действие повтора на уровне страницы с демонстрационным обработчиком.",
      ),
      SectionFallback: text(
        "SectionErrorFallback displays a section label and optional retry action.",
        "SectionErrorFallback показывает подпись раздела и необязательное действие повтора.",
      ),
      LoadingPage: text(
        "PageLoader is the existing page-loading presentation; no request is started.",
        "PageLoader отображает существующее состояние загрузки страницы; запрос не запускается.",
      ),
    },
  },
  "Shared/Feedback/Loading": {
    description: text(
      "Loading presentation: Spinner, Skeleton variants and FloatingLoadingOverlay. The caller owns request state, visibility and accessible status text; these examples do not start requests.",
      "Отображение загрузки: Spinner, варианты Skeleton и FloatingLoadingOverlay. Состоянием запроса, видимостью и доступным текстом статуса управляет вызывающий код; примеры не запускают запросы.",
    ),
    props: {
      size: common.size,
      className: common.className,
      variant: text(
        "Spinner color treatment: accent or inherited current text color.",
        "Цвет индикатора: accent или унаследованный текущий цвет текста.",
      ),
    },
    stories: {
      SkeletonFamily: text(
        "Skeleton, SkeletonText and SkeletonRect use className for geometry; animated controls the base skeleton pulse.",
        "Skeleton, SkeletonText и SkeletonRect задают геометрию через className; animated управляет пульсацией базового Skeleton.",
      ),
      OverlayPositions: text(
        "FloatingLoadingOverlay uses visible, label and position inside a positioned parent; all eight placement presets are shown.",
        "FloatingLoadingOverlay использует visible, label и position внутри позиционированного родителя; показаны все восемь вариантов размещения.",
      ),
    },
  },
  "Shared/Feedback/Toast": {
    description: text(
      "ToastItem presents a supplied toast, and ToastHost renders the existing shared store in a portal. The Host example inserts synthetic entries and removes only its own entries on cleanup; it does not demonstrate backend success.",
      "ToastItem отображает переданное уведомление, а ToastHost выводит существующее общее хранилище в портал. Пример Host добавляет демонстрационные записи и при очистке удаляет только свои; он не подтверждает успех операции на сервере.",
    ),
    props: {
      toast: text(
        "Toast entry containing its id, variant, message and creation time.",
        "Запись уведомления с id, variant, message и временем создания.",
      ),
      onDismiss: text(
        "Called with the entry id when the dismiss button is activated.",
        "Вызывается с id записи при нажатии кнопки закрытия.",
      ),
    },
    stories: {
      Host: text(
        "Uses the existing toast store with local synthetic entries and cleanup, without auto-dismiss timers.",
        "Использует существующее хранилище уведомлений с локальными демонстрационными записями и очисткой, без таймеров автоматического закрытия.",
      ),
    },
  },
  "Shared/Forms/FormField": {
    description: text(
      "Label, supplied control and optional error message in one layout. The caller owns validation, the control id and accessible error associations.",
      "Подпись, переданный элемент управления и необязательное сообщение об ошибке в общей раскладке. Валидация, id элемента и доступные связи с ошибкой остаются у вызывающего кода.",
    ),
    props: {
      children: common.children,
      className: common.className,
      label: text("Visible field label.", "Видимая подпись поля."),
      htmlFor: text(
        "ID of the supplied control associated with the label.",
        "ID переданного элемента управления, связанного с подписью.",
      ),
      error: text(
        "Non-empty validation message rendered with role=alert.",
        "Непустое сообщение валидации, отображаемое с role=alert.",
      ),
    },
  },
  "Shared/Forms/SearchInput": {
    description: text(
      "Controlled search field with an icon and optional clear action. The caller owns the query, debouncing and result loading.",
      "Управляемое поле поиска с иконкой и необязательным действием очистки. Запросом, задержкой перед поиском и загрузкой результатов управляет вызывающий код.",
    ),
    props: {
      placeholder: common.placeholder,
      ariaLabel: common.ariaLabel,
      size: common.size,
      className: common.className,
      inputClassName: common.inputClassName,
      disabled: common.disabled,
      value: text("Current search text.", "Текущий текст поиска."),
      onChange: text(
        "Called with updated text, including an empty string after clearing.",
        "Вызывается с обновлённым текстом, включая пустую строку после очистки.",
      ),
      type: text("Native input mode: search or text.", "Нативный режим поля: search или text."),
      clearable: text(
        "Enables the clear button when the field contains text and is enabled.",
        "Включает кнопку очистки, когда поле содержит текст и доступно для ввода.",
      ),
      onClear: text(
        "Additional callback after the value is cleared; focus returns to the input.",
        "Дополнительный обработчик после очистки значения; фокус возвращается в поле.",
      ),
      iconPosition: text(
        "Places the search icon on the left or right.",
        "Размещает иконку поиска слева или справа.",
      ),
      onKeyDown: text(
        "Keyboard handler forwarded to the input.",
        "Обработчик клавиатуры, передаваемый текстовому полю.",
      ),
    },
  },
  "Shared/Forms/Select": {
    description: text(
      "Controlled single selection constrained to supplied options, with keyboard navigation and a portaled Listbox. Native form integration submits the selected value; use InputSelector when free text is allowed.",
      "Управляемый выбор одного значения только из переданных вариантов, с клавиатурной навигацией и Listbox в портале. Интеграция с нативной формой отправляет выбранное значение; для свободного ввода используйте InputSelector.",
    ),
    props: {
      options: common.options,
      onValueChange: common.onValueChange,
      id: common.id,
      disabled: common.disabled,
      placeholder: common.placeholder,
      emptyText: common.emptyText,
      className: common.className,
      size: common.size,
      value: text("Value of the selected option.", "Значение выбранного варианта."),
      name: text(
        "Name used by the hidden native select during form submission.",
        "Имя скрытого нативного select при отправке формы.",
      ),
      required: text(
        "Enables native required selection validation and focuses the trigger on invalid submission.",
        "Включает нативную проверку обязательного выбора и переводит фокус на кнопку при невалидной отправке.",
      ),
      invalid: text(
        "Marks the trigger invalid and applies the error border.",
        "Отмечает кнопку выбора как невалидную и применяет рамку ошибки.",
      ),
      "aria-label": common["aria-label"],
    },
  },
  "Shared/Forms/InputSelector": {
    description: text(
      "Editable text field with local suggestions. Typing changes the caller-owned value and can filter suggestions; unmatched text remains allowed and the popup hides when no options match. Use Select when a listed value is required.",
      "Редактируемое текстовое поле с локальными подсказками. Ввод меняет значение у вызывающего кода и может фильтровать варианты; произвольный текст разрешён, а при отсутствии совпадений список скрывается. Если нужно значение из списка, используйте Select.",
    ),
    props: {
      options: common.options,
      onValueChange: common.onValueChange,
      id: common.id,
      disabled: common.disabled,
      placeholder: common.placeholder,
      inputClassName: common.inputClassName,
      size: common.size,
      className: common.className,
      value: text(
        "Current editable text; it need not match an option value.",
        "Текущий редактируемый текст; он не обязан совпадать со значением варианта.",
      ),
      searchable: text(
        "Filters suggestions by value, label and description as the user types.",
        "Фильтрует подсказки по value, label и description во время ввода.",
      ),
      invalid: text(
        "Marks the input invalid and applies the error border.",
        "Отмечает поле как невалидное и применяет рамку ошибки.",
      ),
      emptyText: text(
        "Passed to Listbox; the current InputSelector hides the popup when no options match.",
        "Передаётся в Listbox; текущий InputSelector скрывает список, если совпадений нет.",
      ),
      readOnly: text(
        "Keeps the text read-only and prevents opening suggestions.",
        "Делает текст недоступным для редактирования и запрещает открывать подсказки.",
      ),
      name: text(
        "Native input name used by form submission.",
        "Нативное имя текстового поля при отправке формы.",
      ),
      "aria-label": common["aria-label"],
    },
  },
  "Shared/Forms/Listbox": {
    description: text(
      "Anchored option popup shared by Select and InputSelector. The caller owns the trigger, open state, value and keyboard events; public navigation helpers skip disabled options. The popup stays inside its owning dialog when present.",
      "Привязанный к элементу список вариантов, общий для Select и InputSelector. Вызывающий код управляет кнопкой, открытием, значением и клавиатурными событиями; публичные функции навигации пропускают отключённые варианты. Если список находится в диалоге, портал остаётся внутри него.",
    ),
    props: {
      options: common.options,
      emptyText: common.emptyText,
      ariaLabel: common.ariaLabel,
      ariaLabelledBy: common.ariaLabelledBy,
      onClose: common.onClose,
      id: text(
        "Stable listbox id used by the trigger and generated option ids.",
        "Стабильный id списка для связи с кнопкой и формирования id вариантов.",
      ),
      anchorRef: text(
        "Reference to the element that anchors popup position and width.",
        "Ссылка на элемент, определяющий положение и ширину списка.",
      ),
      value: text(
        "Committed selected option value.",
        "Подтверждённое значение выбранного варианта.",
      ),
      activeValue: text(
        "Keyboard/pointer-highlighted option value, separate from the committed value.",
        "Значение варианта, выделенного клавиатурой или указателем, отдельно от подтверждённого выбора.",
      ),
      onActiveChange: text(
        "Reports the enabled option highlighted by pointer movement.",
        "Сообщает о доступном варианте, выделенном движением указателя.",
      ),
      onSelect: text(
        "Called with the chosen enabled option value.",
        "Вызывается со значением выбранного доступного варианта.",
      ),
    },
  },
  "Shared/Lists/SearchableCheckboxList": {
    description: text(
      "Filterable checkbox list with caller-owned selection. Search changes visible options only; hidden selections remain intact. Use UserPickerList for user names, presence and email search.",
      "Список с флажками и поиском, выбором в котором управляет вызывающий код. Поиск меняет только видимые варианты; скрытые выбранные значения сохраняются. Для имён пользователей, присутствия и поиска по почте используйте UserPickerList.",
    ),
    props: {
      query: common.query,
      onQueryChange: common.onQueryChange,
      queryPlaceholder: common.queryPlaceholder,
      emptyLabel: common.emptyLabel,
      inputClassName: common.inputClassName,
      listClassName: common.listClassName,
      className: common.className,
      rowClassName: common.rowClassName,
      options: text(
        "Options with a stable value, renderable label, searchText and optional disabled flag.",
        "Варианты со стабильным value, отображаемой подписью, searchText и необязательным флагом disabled.",
      ),
      selectedValues: text(
        "Complete selected-value set, including options hidden by the query.",
        "Полный набор выбранных значений, включая скрытые поиском варианты.",
      ),
      onToggle: text(
        "Requests toggling one value; the caller updates the full selection.",
        "Запрашивает переключение одного значения; вызывающий код обновляет полный выбор.",
      ),
    },
  },
  "Shared/Lists/UserPickerList": {
    description: text(
      "User checkbox list with presence and name/username/email search, backed by caller-supplied candidates and complete selection. Synthetic users are local fixtures; these examples do not load accounts or call the API.",
      "Список пользователей с флажками, присутствием и поиском по имени, username и почте; кандидатов и полный выбор передаёт вызывающий код. Демонстрационные пользователи — локальные данные примеров; примеры не загружают учётные записи и не вызывают API.",
    ),
    props: {
      query: common.query,
      onQueryChange: common.onQueryChange,
      queryPlaceholder: common.queryPlaceholder,
      emptyLabel: common.emptyLabel,
      inputClassName: common.inputClassName,
      listClassName: common.listClassName,
      className: common.className,
      rowClassName: common.rowClassName,
      options: text(
        "User rows containing ids, display/search fields, presence and optional disabled state.",
        "Строки пользователей с id, полями отображения и поиска, присутствием и необязательным состоянием disabled.",
      ),
      selectedUserIds: text(
        "Complete set of selected user ids; searching does not remove hidden selections.",
        "Полный набор id выбранных пользователей; поиск не удаляет скрытые выбранные значения.",
      ),
      onToggle: text(
        "Requests toggling one user id in the caller-owned selection.",
        "Запрашивает переключение одного id пользователя в выборе, которым управляет вызывающий код.",
      ),
    },
  },
  "Shared/Lists/SelectableRow": {
    description: text(
      "Shared active-row appearance with optional button semantics. Use as=button for an action; the default div does not provide keyboard interaction or listbox behavior.",
      "Общее оформление строки с активным состоянием и необязательной семантикой кнопки. Для действия используйте as=button; div по умолчанию не обеспечивает клавиатурное взаимодействие или поведение listbox.",
    ),
    props: {
      children: common.children,
      className: common.className,
      active: text(
        "Applies the selected/active row appearance.",
        "Применяет оформление выбранной или активной строки.",
      ),
      as: text(
        "Rendered element: div for presentation or button for an action.",
        "Отображаемый элемент: div для представления или button для действия.",
      ),
      onClick: text(
        "Action handler used only when as=button.",
        "Обработчик действия, используемый только при as=button.",
      ),
      type: text("Native type of the button branch.", "Нативный тип элемента в варианте button."),
      "aria-label": common["aria-label"],
    },
  },
  "Shared/Overlays/AnchoredPopover": {
    description: text(
      "Caller-positioned panel with outside-click and Escape dismissal. The caller supplies viewport coordinates and owns focus and trigger behavior; the component does not calculate its anchor or provide a focus trap.",
      "Панель с позицией от вызывающего кода, закрываемая по нажатию снаружи и Escape. Вызывающий код задаёт координаты в области просмотра и управляет фокусом и открывающим элементом; компонент не вычисляет привязку и не удерживает фокус внутри.",
    ),
    props: {
      open: common.open,
      onClose: common.onClose,
      ariaLabel: common.ariaLabel,
      children: common.children,
      panelStyle: text(
        "Inline panel positioning and dimensions, supplied by the caller.",
        "Переданные вызывающим кодом встроенные стили положения и размеров панели.",
      ),
      panelClassName: text(
        "Additional CSS classes for the visible panel.",
        "Дополнительные CSS-классы видимой панели.",
      ),
      testId: text("data-testid on the panel.", "data-testid панели."),
      backdropTestId: text(
        "data-testid on the dismissal backdrop.",
        "data-testid фона, закрывающего панель.",
      ),
    },
  },
  "Shared/Overlays/AppDialog": {
    description: text(
      "Modal layout with a shared heading, close control, optional footer and Radix focus/dismiss behavior. The family also provides Shell and form-footer primitives; feature code owns submission and data.",
      "Модальная раскладка с общим заголовком, кнопкой закрытия, необязательным footer и управлением фокусом/закрытием через Radix. Семейство также предоставляет Shell и footer формы; отправкой и данными управляет вызывающий код.",
    ),
    props: {
      open: common.open,
      onOpenChange: common.onOpenChange,
      children: common.children,
      title: text(
        "Visible and accessible dialog heading.",
        "Видимый и доступный заголовок диалога.",
      ),
      description: text(
        "Optional explanatory text associated with the dialog.",
        "Необязательный поясняющий текст, связанный с диалогом.",
      ),
      footer: text(
        "Footer content, usually cancel/submit actions; omit for a custom layout inside children.",
        "Содержимое footer, обычно отмена и отправка; пропустите для собственной раскладки внутри children.",
      ),
      maxWidthClassName: text(
        "Utility class setting the maximum dialog width.",
        "CSS-класс максимальной ширины диалога.",
      ),
      positionClassName: text(
        "Utility classes controlling vertical placement.",
        "CSS-классы вертикального положения.",
      ),
      scrollBody: text(
        "Keeps heading and footer fixed while only the body scrolls.",
        "Оставляет заголовок и footer на месте, прокручивая только содержимое.",
      ),
      showCloseButton: text(
        "Displays the header close button, which requests onOpenChange(false).",
        "Показывает кнопку закрытия в заголовке, вызывающую onOpenChange(false).",
      ),
      onCloseAutoFocus: text(
        "Radix callback for focus restoration after closing; may prevent the default restoration.",
        "Обработчик Radix для восстановления фокуса после закрытия; позволяет отменить стандартное восстановление.",
      ),
    },
    stories: {
      SubmittingFooter: text(
        "AppDialogFormFooter shows its busy submit state using a local synthetic callback.",
        "AppDialogFormFooter показывает занятое состояние отправки с локальным демонстрационным обработчиком.",
      ),
      DisabledSubmitFooter: text(
        "The shared footer demonstrates a disabled submit action without changing cancel behavior.",
        "Общий footer показывает отключённую отправку без изменения поведения отмены.",
      ),
    },
  },
  "Shared/Overlays/AppTooltip": {
    description: text(
      "Hover/focus explanation for one focusable trigger, rendered in a viewport-constrained portal and dismissible with Escape. Tooltip content must not contain interactive controls; use a popover or dialog for those.",
      "Пояснение при наведении или фокусе на одном доступном для фокуса элементе, выводимое в портал с учётом границ окна и закрываемое по Escape. Содержимое tooltip не должно включать интерактивные элементы; для них используйте popover или диалог.",
    ),
    props: {
      children: text(
        "One focusable trigger that receives aria-describedby while the tooltip is open.",
        "Один доступный для фокуса элемент, получающий aria-describedby при открытой подсказке.",
      ),
      content: text(
        "Explanatory React content without interactive controls.",
        "Поясняющее React-содержимое без интерактивных элементов.",
      ),
      side: text(
        "Preferred placement above or below the trigger.",
        "Предпочтительное положение над или под открывающим элементом.",
      ),
      align: text(
        "Alignment relative to the trigger before viewport clamping.",
        "Выравнивание относительно открывающего элемента до ограничения границами окна.",
      ),
      className: text(
        "Additional CSS classes for the tooltip panel.",
        "Дополнительные CSS-классы панели подсказки.",
      ),
      wrapperClassName: text(
        "Additional CSS classes for the trigger wrapper.",
        "Дополнительные CSS-классы обёртки открывающего элемента.",
      ),
    },
  },
  "Shared/Overlays/DropdownMenu": {
    description: text(
      "Controlled action menu for a visible trigger or context-menu coordinates, with action, checkbox, submenu, separator and custom items. Callers own permissions and action availability; reuse the context-menu helpers for pointer and keyboard invocation.",
      "Управляемое меню действий для видимого открывающего элемента или координат контекстного меню, с действиями, флажками, подменю, разделителями и произвольными блоками. Права и доступность действий определяет вызывающий код; для открытия указателем и клавиатурой используйте общие функции контекстного меню.",
    ),
    props: {
      open: common.open,
      onOpenChange: common.onOpenChange,
      items: text(
        "Ordered menu item definitions, including action handlers and controlled checkbox states.",
        "Упорядоченные описания пунктов, включая обработчики действий и управляемые состояния флажков.",
      ),
      trigger: text(
        "Optional trigger element, used as the Radix trigger child.",
        "Необязательный открывающий элемент, используемый как дочерний элемент Radix trigger.",
      ),
      contextAnchor: text(
        "Viewport left/top coordinates for context-menu mode.",
        "Координаты left/top в области просмотра для контекстного меню.",
      ),
      source: text(
        "Active opening source: trigger or context.",
        "Активный источник открытия: trigger или context.",
      ),
      onSourceChange: text(
        "Reports which opening source was activated.",
        "Сообщает, какой источник открытия был активирован.",
      ),
      modal: text(
        "Forwards the modal interaction mode to Radix.",
        "Передаёт Radix модальный режим взаимодействия.",
      ),
      contentProps: text(
        "Shared popup positioning and lifecycle callbacks.",
        "Общие параметры положения и обработчики жизненного цикла всплывающего меню.",
      ),
      triggerContentProps: text(
        "Popup overrides for the visible-trigger mode.",
        "Переопределения всплывающего меню для открытия видимым элементом.",
      ),
      contextContentProps: text(
        "Popup overrides for context-menu mode.",
        "Переопределения всплывающего меню для контекстного режима.",
      ),
      contentVariant: text(
        "Shared menu width/padding preset.",
        "Общий вариант ширины и отступов меню.",
      ),
      contentClassName: text(
        "Additional CSS classes for the main menu popup.",
        "Дополнительные CSS-классы основного всплывающего меню.",
      ),
      subContentVariant: text(
        "Width/padding preset for submenu popups.",
        "Вариант ширины и отступов всплывающих подменю.",
      ),
      subContentClassName: text(
        "Additional CSS classes for submenu popups.",
        "Дополнительные CSS-классы всплывающих подменю.",
      ),
      itemClassName: text(
        "Additional CSS classes for ordinary menu items.",
        "Дополнительные CSS-классы обычных пунктов меню.",
      ),
      submenuTriggerClassName: text(
        "Additional CSS classes for submenu trigger items.",
        "Дополнительные CSS-классы пунктов, открывающих подменю.",
      ),
      checkboxItemClassName: text(
        "Additional CSS classes for checkbox items.",
        "Дополнительные CSS-классы пунктов с флажком.",
      ),
      dangerItemClassName: text(
        "Additional CSS classes for danger-marked items.",
        "Дополнительные CSS-классы пунктов с отметкой danger.",
      ),
      separatorClassName: text(
        "Additional CSS classes for separators.",
        "Дополнительные CSS-классы разделителей.",
      ),
    },
  },
  "Shared/Overlays/FolderFormModal": {
    description: text(
      "Existing create/edit folder form with shared color presets and an asynchronous caller-supplied submit action. These stories use a synthetic successful callback without writing a store or calling an API.",
      "Существующая форма создания/редактирования папки с общими цветами и асинхронной отправкой через вызывающий код. Примеры используют демонстрационный успешный обработчик без записи в хранилище и вызова API.",
    ),
    props: {
      open: common.open,
      onOpenChange: common.onOpenChange,
      mode: text(
        "Selects create or edit labels and unchanged-value handling.",
        "Выбирает подписи создания или редактирования и обработку неизменённых значений.",
      ),
      initialName: text(
        "Initial folder name restored when the dialog opens.",
        "Начальное имя папки, восстанавливаемое при открытии диалога.",
      ),
      initialBackgroundColor: text(
        "Initial folder background color as the existing numeric color value.",
        "Начальный цвет фона папки в существующем числовом формате.",
      ),
      onSubmit: text(
        "Receives the trimmed name and backgroundColor; resolving true closes the dialog.",
        "Получает имя без крайних пробелов и backgroundColor; результат true закрывает диалог.",
      ),
    },
  },
  "Shared/Content/AttachmentCard": {
    description: text(
      "Attachment presentation for ready files/images, validation/queue, upload progress and errors. AttachmentCard selects a variant by status, and AttachmentCardList groups cards; callers own transfer state and retry/remove actions. The primary props table describes AttachmentReadyCard.",
      "Отображение вложений: готовые файлы/изображения, проверка/очередь, ход загрузки и ошибки. AttachmentCard выбирает вариант по status, а AttachmentCardList объединяет карточки; состоянием передачи и действиями повтора/удаления управляет вызывающий код. Основная таблица props описывает AttachmentReadyCard.",
    ),
    props: {
      className: common.className,
      fileName: text(
        "Displayed filename and context for accessible action labels.",
        "Отображаемое имя файла и контекст доступных подписей действий.",
      ),
      contentType: text(
        "Optional MIME type used for file metadata and icon selection.",
        "Необязательный MIME-тип для метаданных файла и выбора иконки.",
      ),
      sizeBytes: text(
        "Optional file size in bytes for metadata display.",
        "Необязательный размер файла в байтах для отображения метаданных.",
      ),
      previewUrl: text(
        "Optional preview image URL; required by the image branch of AttachmentCard.",
        "Необязательный URL превью; обязателен для варианта image в AttachmentCard.",
      ),
      appearance: text(
        "Regular or embedded presentation of the ready card.",
        "Обычное или встроенное оформление готовой карточки.",
      ),
      role: text(
        "List-item semantics or presentation-only semantics for the ready card.",
        "Семантика элемента списка или только представления для готовой карточки.",
      ),
      onRemove: text(
        "Caller action for removing the attachment.",
        "Действие вызывающего кода для удаления вложения.",
      ),
    },
    stories: {
      States: text(
        "Pending cards use detailText; uploads use progress and onCancel; error cards use errorMessage, onRetry and onRemove. Callbacks are synthetic in this gallery.",
        "Карточки ожидания используют detailText; загрузки — progress и onCancel; ошибки — errorMessage, onRetry и onRemove. В этой галерее обработчики демонстрационные.",
      ),
    },
  },
  "Shared/Content/SectionLabel": {
    description: text(
      "Small shared section label with standard text tones. The caller supplies the visible copy and chooses a paragraph or span.",
      "Небольшая общая подпись раздела со стандартными цветами текста. Видимый текст и выбор paragraph или span задаёт вызывающий код.",
    ),
    props: {
      children: common.children,
      className: common.className,
      as: text("Rendered text element: p or span.", "Отображаемый текстовый элемент: p или span."),
      tone: text("Default or muted text treatment.", "Обычный или приглушённый цвет текста."),
    },
  },
  "Shared/Content/WorkspaceMemberCard": {
    description: text(
      "Presentational member row with supplied avatar, name, secondary text and action slots. Domain loading, avatar resolution and permissions stay with the caller.",
      "Строка участника с переданными аватаром, именем, дополнительным текстом и действием. Загрузка предметных данных, получение аватара и права остаются у вызывающего кода.",
    ),
    props: {
      avatar: text("Supplied avatar element.", "Переданный элемент аватара."),
      name: text("Primary member display name.", "Основное отображаемое имя участника."),
      roleLabel: text(
        "Optional compact role label beside the name.",
        "Необязательная компактная подпись роли рядом с именем.",
      ),
      secondaryText: text(
        "Optional secondary line, such as an email or status.",
        "Необязательная дополнительная строка, например почта или статус.",
      ),
      action: text(
        "Optional trailing action element supplied by the caller.",
        "Необязательный элемент действия справа, переданный вызывающим кодом.",
      ),
    },
  },
  "Shared/Content/WorkspaceMessageQuoteFrame": {
    description: text(
      "Shared visual shell for quoted messages and composer reply prefacing. It lays out a header, optional leading media and body; callers retain the existing sanitized message-rendering path.",
      "Общая визуальная оболочка цитаты сообщения и блока ответа в редакторе. Располагает заголовок, необязательное медиа слева и содержимое; вызывающий код сохраняет существующий безопасный путь рендера сообщений.",
    ),
    props: {
      children: common.children,
      className: common.className,
      header: text(
        "Author or status line above the quoted body.",
        "Строка автора или статуса над цитируемым содержимым.",
      ),
      headerMuted: text(
        "Uses the muted header tone, for example for an unavailable quote.",
        "Использует приглушённый цвет заголовка, например для недоступной цитаты.",
      ),
      surface: text(
        "Selects message or composer background only; padding and the accent bar stay unchanged.",
        "Выбирает только фон message или composer; отступы и акцентная полоса остаются прежними.",
      ),
      leading: text(
        "Optional media shown before both header and body.",
        "Необязательное медиа перед заголовком и содержимым.",
      ),
      headerProps: text(
        "Extra attributes and classes forwarded to the header span.",
        "Дополнительные атрибуты и классы, передаваемые span заголовка.",
      ),
    },
  },
  "Shared/Navigation/FloatingScrollToBottomButton": {
    description: text(
      "Shared scroll-to-bottom action with an optional unread badge. The caller controls visibility and performs scrolling; this component does not inspect message state.",
      "Общее действие перехода к низу списка с необязательным значком непрочитанного. Видимость и прокрутку обеспечивает вызывающий код; компонент не анализирует состояние сообщений.",
    ),
    props: {
      onClick: common.onClick,
      unreadCount: text(
        "Shows an unread badge for positive counts and includes the count in the accessible name.",
        "Показывает значок при положительном количестве и добавляет количество в доступное имя.",
      ),
      inline: text(
        "Uses relative inline placement instead of the absolute bottom-right overlay.",
        "Использует относительное размещение в потоке вместо абсолютного положения справа внизу.",
      ),
    },
  },
  "Shared/Navigation/PanelMenuRow": {
    description: text(
      "Flat panel action row with icon, label/subtitle and a trailing content slot. Root/nested and regular/compact variants share the existing spacing; the caller owns the action and its permissions.",
      "Плоская строка действия панели с иконкой, подписью/подзаголовком и содержимым справа. Варианты root/nested и regular/compact используют существующие отступы; действие и права определяет вызывающий код.",
    ),
    props: {
      onClick: common.onClick,
      disabled: common.disabled,
      id: common.id,
      ariaLabel: common.ariaLabel,
      label: text("Primary visible action label.", "Основная видимая подпись действия."),
      icon: text(
        "Optional existing icon registry name.",
        "Необязательное имя иконки существующего реестра.",
      ),
      iconSize: text("Leading icon size in pixels.", "Размер иконки слева в пикселях."),
      subtitle: text(
        "Optional supporting content below the primary label.",
        "Необязательное пояснение под основной подписью.",
      ),
      right: text(
        "Optional trailing content, such as a value or chevron.",
        "Необязательное содержимое справа, например значение или стрелка.",
      ),
      tone: text(
        "Default tone or danger treatment for destructive actions.",
        "Обычный тон или оформление danger для разрушительных действий.",
      ),
      variant: text("Root or nested row spacing.", "Отступы корневой или вложенной строки."),
      density: text(
        "Regular or compact vertical spacing.",
        "Обычные или компактные вертикальные отступы.",
      ),
      testId: text("data-testid on the row button.", "data-testid кнопки строки."),
      "aria-controls": text(
        "ID of the element controlled by this row.",
        "ID элемента, которым управляет строка.",
      ),
      "aria-expanded": text(
        "Expanded state of the content controlled by this row.",
        "Состояние раскрытия содержимого, которым управляет строка.",
      ),
    },
  },
  "Shared/Layout/ScrollArea": {
    description: text(
      "Shared vertical scroll container with the existing scrollbar styling. It does not own virtualization, data loading or message anchors.",
      "Общий контейнер вертикальной прокрутки с существующим оформлением полосы прокрутки. Он не управляет виртуализацией, загрузкой данных или якорями сообщений.",
    ),
    props: {
      children: common.children,
      className: common.className,
      as: text(
        "Container element; the current public contract allows div.",
        "Элемент контейнера; текущий публичный контракт допускает div.",
      ),
    },
  },
};
