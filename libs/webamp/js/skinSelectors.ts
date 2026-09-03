import { LETTERS } from "./constants";
import { FONT_LOOKUP, imageConstFromChar } from "./skinSprites";

interface Selectors {
  [name: string]: string[];
}

export const imageSelectors: Selectors = {
  MAIN_BALANCE_BACKGROUND: [".wa-balance"],
  MAIN_BALANCE_THUMB: [
    ".wa-balance::-webkit-slider-thumb",
    ".wa-balance::-moz-range-thumb",
  ],
  MAIN_BALANCE_THUMB_ACTIVE: [
    ".wa-balance:active::-webkit-slider-thumb",
    ".wa-balance:active::-moz-range-thumb",
  ],
  MAIN_PREVIOUS_BUTTON: [".actions .wa-previous"],
  MAIN_PREVIOUS_BUTTON_ACTIVE: [".actions .wa-previous.winamp-active"],
  MAIN_PLAY_BUTTON: [".actions .wa-play"],
  MAIN_PLAY_BUTTON_ACTIVE: [".actions .wa-play.winamp-active"],
  MAIN_PAUSE_BUTTON: [".actions .wa-pause"],
  MAIN_PAUSE_BUTTON_ACTIVE: [".actions .wa-pause.winamp-active"],
  MAIN_STOP_BUTTON: [".actions .wa-stop"],
  MAIN_STOP_BUTTON_ACTIVE: [".actions .wa-stop.winamp-active"],
  MAIN_NEXT_BUTTON: [".actions .wa-next"],
  MAIN_NEXT_BUTTON_ACTIVE: [".actions .wa-next.winamp-active"],
  MAIN_EJECT_BUTTON: [".wa-eject"],
  MAIN_EJECT_BUTTON_ACTIVE: [".wa-eject.winamp-active"],
  MAIN_WINDOW_BACKGROUND: [".wa-main-window"],
  MAIN_STEREO: [".media-info .wa-stereo", ".stop .media-info .wa-stereo.selected"],
  MAIN_STEREO_SELECTED: [".media-info .wa-stereo.selected"],
  MAIN_MONO: [".media-info .wa-mono", ".stop .media-info .wa-mono.selected"],
  MAIN_MONO_SELECTED: [".media-info .wa-mono.selected"],
  NO_MINUS_SIGN: [".wa-time .wa-minus-sign"],
  MINUS_SIGN: [".wa-time.countdown .wa-minus-sign"],
  DIGIT_0: [".digit-0"],
  DIGIT_1: [".digit-1"],
  DIGIT_2: [".digit-2"],
  DIGIT_3: [".digit-3"],
  DIGIT_4: [".digit-4"],
  DIGIT_5: [".digit-5"],
  DIGIT_6: [".digit-6"],
  DIGIT_7: [".digit-7"],
  DIGIT_8: [".digit-8"],
  DIGIT_9: [".digit-9"],
  NO_MINUS_SIGN_EX: [".wa-time .wa-minus-sign"],
  MINUS_SIGN_EX: [".wa-time.countdown .wa-minus-sign"],
  DIGIT_0_EX: [".digit-0"],
  DIGIT_1_EX: [".digit-1"],
  DIGIT_2_EX: [".digit-2"],
  DIGIT_3_EX: [".digit-3"],
  DIGIT_4_EX: [".digit-4"],
  DIGIT_5_EX: [".digit-5"],
  DIGIT_6_EX: [".digit-6"],
  DIGIT_7_EX: [".digit-7"],
  DIGIT_8_EX: [".digit-8"],
  DIGIT_9_EX: [".digit-9"],
  MAIN_PLAYING_INDICATOR: [".play .wa-play-pause"],
  MAIN_PAUSED_INDICATOR: [".pause .wa-play-pause"],
  MAIN_STOPPED_INDICATOR: [".stop .wa-play-pause"],
  MAIN_NOT_WORKING_INDICATOR: [".wa-work-indicator"],
  MAIN_WORKING_INDICATOR: [".wa-work-indicator.selected"],
  PLAYLIST_TOP_TILE: [
    ".playlist-top-left-fill",
    ".playlist-top-left-spacer",
    ".playlist-top-right-fill",
    ".playlist-top-right-spacer",
  ],
  PLAYLIST_TOP_LEFT_CORNER: [".playlist-top-left"],
  PLAYLIST_TITLE_BAR: [".playlist-top-title"],
  PLAYLIST_TOP_RIGHT_CORNER: [".playlist-top-right"],
  PLAYLIST_TOP_TILE_SELECTED: [
    ".selected .playlist-top-left-fill",
    ".selected .playlist-top-left-spacer",
    ".selected .playlist-top-right-fill",
    ".selected .playlist-top-right-spacer",
  ],
  PLAYLIST_TOP_LEFT_SELECTED: [".selected .playlist-top-left"],
  PLAYLIST_TITLE_BAR_SELECTED: [".selected .playlist-top-title"],
  PLAYLIST_TOP_RIGHT_CORNER_SELECTED: [".selected .playlist-top-right"],
  PLAYLIST_LEFT_TILE: [".playlist-middle-left"],
  PLAYLIST_RIGHT_TILE: [".playlist-middle-right"],
  PLAYLIST_SCROLL_HANDLE: [".playlist-scrollbar-handle"],
  PLAYLIST_SCROLL_HANDLE_SELECTED: [
    ".playlist-middle-right.winamp-active .playlist-scrollbar-handle",
  ],
  PLAYLIST_BOTTOM_TILE: [".playlist-bottom"],
  PLAYLIST_BOTTOM_LEFT_CORNER: [".playlist-bottom-left"],
  PLAYLIST_BOTTOM_RIGHT_CORNER: [".playlist-bottom-right"],
  PLAYLIST_VISUALIZER_BACKGROUND: [".playlist-visualizer"],
  PLAYLIST_SHADE_BACKGROUND: [".wa-playlist-window-shade"],
  PLAYLIST_SHADE_BACKGROUND_LEFT: [".wa-playlist-window-shade .left"],
  PLAYLIST_SHADE_BACKGROUND_RIGHT: [".wa-playlist-window-shade .right"],
  PLAYLIST_SHADE_BACKGROUND_RIGHT_SELECTED: [
    ".wa-playlist-window-shade.selected .right",
  ],

  PLAYLIST_ADD_MENU_BAR: [".wa-playlist-add-menu.selected .bar"],
  PLAYLIST_ADD_URL: [".wa-playlist-add-menu .add-url"],
  PLAYLIST_ADD_URL_SELECTED: [".wa-playlist-add-menu .hover .add-url"],
  PLAYLIST_ADD_DIR: [".wa-playlist-add-menu .add-dir"],
  PLAYLIST_ADD_DIR_SELECTED: [".wa-playlist-add-menu .hover .add-dir"],
  PLAYLIST_ADD_FILE: [".wa-playlist-add-menu .add-file"],
  PLAYLIST_ADD_FILE_SELECTED: [".wa-playlist-add-menu .hover .add-file"],

  PLAYLIST_REMOVE_MENU_BAR: [".wa-playlist-remove-menu.selected .bar"],
  PLAYLIST_REMOVE_ALL: [".wa-playlist-remove-menu .remove-all"],
  PLAYLIST_REMOVE_ALL_SELECTED: [".wa-playlist-remove-menu .hover .remove-all"],
  PLAYLIST_CROP: [".wa-playlist-remove-menu .crop"],
  PLAYLIST_CROP_SELECTED: [".wa-playlist-remove-menu .hover .crop"],
  PLAYLIST_REMOVE_SELECTED: [".wa-playlist-remove-menu .remove-selected"],
  PLAYLIST_REMOVE_SELECTED_SELECTED: [
    ".wa-playlist-remove-menu .hover .remove-selected",
  ],
  PLAYLIST_REMOVE_MISC: [".wa-playlist-remove-menu .remove-misc"],
  PLAYLIST_REMOVE_MISC_SELECTED: [".wa-playlist-remove-menu .hover .remove-misc"],

  PLAYLIST_SELECT_MENU_BAR: [".wa-playlist-selection-menu.selected .bar"],
  PLAYLIST_INVERT_SELECTION: [".wa-playlist-selection-menu .invert-selection"],
  PLAYLIST_INVERT_SELECTION_SELECTED: [
    ".wa-playlist-selection-menu .hover .invert-selection",
  ],
  PLAYLIST_SELECT_ZERO: [".wa-playlist-selection-menu .select-zero"],
  PLAYLIST_SELECT_ZERO_SELECTED: [
    ".wa-playlist-selection-menu .hover .select-zero",
  ],
  PLAYLIST_SELECT_ALL: [".wa-playlist-selection-menu .select-all"],
  PLAYLIST_SELECT_ALL_SELECTED: [".wa-playlist-selection-menu .hover .select-all"],
  PLAYLIST_CLOSE_SELECTED: [".wa-playlist-close-button.winamp-active"],
  PLAYLIST_COLLAPSE_SELECTED: [
    ".wa-playlist-window .wa-playlist-shade-button.winamp-active",
  ],
  PLAYLIST_EXPAND_SELECTED: [
    ".wa-playlist-window-shade .wa-playlist-shade-button.winamp-active",
  ],

  PLAYLIST_MISC_MENU_BAR: [".wa-playlist-misc-menu.selected .bar"],
  PLAYLIST_MISC_OPTIONS: [".wa-playlist-misc-menu .misc-options"],
  PLAYLIST_MISC_OPTIONS_SELECTED: [".wa-playlist-misc-menu .hover .misc-options"],
  PLAYLIST_FILE_INFO: [".wa-playlist-misc-menu .file-info"],
  PLAYLIST_FILE_INFO_SELECTED: [".wa-playlist-misc-menu .hover .file-info"],
  PLAYLIST_SORT_LIST: [".wa-playlist-misc-menu .sort-list"],
  PLAYLIST_SORT_LIST_SELECTED: [".wa-playlist-misc-menu .hover .sort-list"],

  PLAYLIST_LIST_BAR: [".wa-playlist-list-menu.selected .bar"],
  PLAYLIST_NEW_LIST: [".wa-playlist-list-menu .new-list"],
  PLAYLIST_NEW_LIST_SELECTED: [".wa-playlist-list-menu .hover .new-list"],
  PLAYLIST_LOAD_LIST: [".wa-playlist-list-menu .load-list"],
  PLAYLIST_LOAD_LIST_SELECTED: [".wa-playlist-list-menu .hover .load-list"],
  PLAYLIST_SAVE_LIST: [".wa-playlist-list-menu .save-list"],
  PLAYLIST_SAVE_LIST_SELECTED: [".wa-playlist-list-menu .hover .save-list"],

  EQ_WINDOW_BACKGROUND: [".wa-equalizer-window:not(.shade)"],
  EQ_TITLE_BAR: [".equalizer-top"],
  EQ_TITLE_BAR_SELECTED: [".selected .equalizer-top"],
  EQ_SLIDER_BACKGROUND: [".band"],
  EQ_SLIDER_THUMB: [".band .slider-handle"],
  // Put the "active" pseudo selector on the parent, since clicking
  // anywhere on the track moves the slider.
  EQ_SLIDER_THUMB_SELECTED: [".band.winamp-active .slider-handle"],
  EQ_ON_BUTTON: [".wa-on"],
  EQ_ON_BUTTON_DEPRESSED: [".wa-on.winamp-active"],
  EQ_ON_BUTTON_SELECTED: [".wa-on.selected"],
  EQ_ON_BUTTON_SELECTED_DEPRESSED: [".wa-on.selected.winamp-active"],
  EQ_AUTO_BUTTON: [".wa-auto"],
  EQ_AUTO_BUTTON_DEPRESSED: [".wa-auto.winamp-active"],
  EQ_AUTO_BUTTON_SELECTED: [".wa-auto.selected"],
  EQ_AUTO_BUTTON_SELECTED_DEPRESSED: [".wa-auto.selected.winamp-active"],
  EQ_GRAPH_BACKGROUND: [".wa-eqGraph"],
  EQ_PRESETS_BUTTON: [".wa-presets"],
  EQ_PRESETS_BUTTON_SELECTED: [".wa-presets.winamp-active"],
  EQ_PREAMP_LINE: [".wa-preamp-line"],
  EQ_SHADE_BACKGROUND: [".wa-equalizer-window.shade"],
  EQ_SHADE_BACKGROUND_SELECTED: [".wa-equalizer-window.shade.selected"],
  EQ_SHADE_VOLUME_SLIDER_LEFT: [
    ".wa-equalizer-volume.left::-webkit-slider-thumb",
    ".wa-equalizer-volume.left::-moz-range-thumb",
  ],
  EQ_SHADE_VOLUME_SLIDER_CENTER: [
    ".wa-equalizer-volume.center::-webkit-slider-thumb",
    ".wa-equalizer-volume.center::-moz-range-thumb",
  ],
  EQ_SHADE_VOLUME_SLIDER_RIGHT: [
    ".wa-equalizer-volume.right::-webkit-slider-thumb",
    ".wa-equalizer-volume.right::-moz-range-thumb",
  ],
  EQ_SHADE_BALANCE_SLIDER_LEFT: [
    ".wa-equalizer-balance.left::-webkit-slider-thumb",
    ".wa-equalizer-balance.left::-moz-range-thumb",
  ],
  EQ_SHADE_BALANCE_SLIDER_CENTER: [
    ".wa-equalizer-balance.center::-webkit-slider-thumb",
    ".wa-equalizer-balance.center::-moz-range-thumb",
  ],
  EQ_SHADE_BALANCE_SLIDER_RIGHT: [
    ".wa-equalizer-balance.right::-webkit-slider-thumb",
    ".wa-equalizer-balance.right::-moz-range-thumb",
  ],
  EQ_MAXIMIZE_BUTTON_ACTIVE: [".wa-equalizer-shade.winamp-active"],
  EQ_MINIMIZE_BUTTON_ACTIVE: [
    ".wa-equalizer-window.shade .wa-equalizer-shade.winamp-active",
  ],
  EQ_CLOSE_BUTTON: [
    ".wa-equalizer-window.selected .wa-eq-buttons.clicked .wa-equalizer-close",
  ],
  EQ_CLOSE_BUTTON_ACTIVE: [
    ".wa-equalizer-window.selected .wa-eq-buttons.clicked .wa-equalizer-close.winamp-active",
  ],
  EQ_SHADE_CLOSE_BUTTON: [
    ".wa-equalizer-window.shade.selected .wa-eq-buttons.clicked .wa-equalizer-close",
  ],
  EQ_SHADE_CLOSE_BUTTON_ACTIVE: [
    ".wa-equalizer-window.shade.selected .wa-eq-buttons.clicked .wa-equalizer-close.winamp-active",
  ],
  MAIN_POSITION_SLIDER_BACKGROUND: [".wa-position"],
  MAIN_POSITION_SLIDER_THUMB: [
    ".wa-position::-webkit-slider-thumb",
    ".wa-position::-moz-range-thumb",
  ],
  MAIN_POSITION_SLIDER_THUMB_SELECTED: [
    ".wa-position:active::-webkit-slider-thumb",
    ".wa-position:active::-moz-range-thumb",
  ],
  MAIN_SHUFFLE_BUTTON: [".wa-shuffle"],
  MAIN_SHUFFLE_BUTTON_DEPRESSED: [".wa-shuffle.winamp-active"],
  MAIN_SHUFFLE_BUTTON_SELECTED: [".wa-shuffle.selected"],
  MAIN_SHUFFLE_BUTTON_SELECTED_DEPRESSED: [".wa-shuffle.selected.winamp-active"],
  MAIN_REPEAT_BUTTON: [".wa-repeat"],
  MAIN_REPEAT_BUTTON_DEPRESSED: [".wa-repeat.winamp-active"],
  MAIN_REPEAT_BUTTON_SELECTED: [".wa-repeat.selected"],
  MAIN_REPEAT_BUTTON_SELECTED_DEPRESSED: [".wa-repeat.selected.winamp-active"],
  MAIN_EQ_BUTTON: [".wa-equalizer-button"],
  MAIN_EQ_BUTTON_SELECTED: [".wa-equalizer-button.selected"],
  MAIN_EQ_BUTTON_DEPRESSED: [".wa-equalizer-button.winamp-active"],
  MAIN_EQ_BUTTON_DEPRESSED_SELECTED: [
    ".wa-equalizer-button.selected.winamp-button",
  ],
  MAIN_PLAYLIST_BUTTON: [".wa-playlist-button"],
  MAIN_PLAYLIST_BUTTON_SELECTED: [".wa-playlist-button.selected"],
  MAIN_PLAYLIST_BUTTON_DEPRESSED: [".wa-playlist-button.winamp-active"],
  MAIN_PLAYLIST_BUTTON_DEPRESSED_SELECTED: [
    ".wa-playlist-button.selected.winamp-active",
  ],
  MAIN_TITLE_BAR: [".wa-title-bar"],
  MAIN_TITLE_BAR_SELECTED: [".selected .wa-title-bar"],
  MAIN_EASTER_EGG_TITLE_BAR: [".llama .wa-title-bar"],
  MAIN_EASTER_EGG_TITLE_BAR_SELECTED: [".llama.selected .wa-title-bar"],
  MAIN_OPTIONS_BUTTON: [".selected .wa-title-bar .wa-option.clicked"],
  MAIN_OPTIONS_BUTTON_DEPRESSED: [
    ".selected .wa-title-bar .wa-option:active",
    ".selected .wa-title-bar .wa-option.selected",
  ],
  MAIN_MINIMIZE_BUTTON: [".selected .wa-title-bar .wa-minimize.clicked"],
  MAIN_MINIMIZE_BUTTON_DEPRESSED: [
    ".selected .wa-title-bar .wa-minimize.winamp-active",
  ],
  MAIN_SHADE_BUTTON: [".selected .wa-title-bar .wa-shade.clicked"],
  MAIN_SHADE_BUTTON_DEPRESSED: [".selected .wa-title-bar .wa-shade.winamp-active"],
  MAIN_CLOSE_BUTTON: [".selected .wa-title-bar .wa-close.clicked"],
  MAIN_CLOSE_BUTTON_DEPRESSED: [".selected .wa-title-bar .wa-close.winamp-active"],
  MAIN_CLUTTER_BAR_BACKGROUND: [".wa-clutter-bar"],
  MAIN_CLUTTER_BAR_BACKGROUND_DISABLED: [".wa-clutter-bar.disabled"],
  MAIN_CLUTTER_BAR_BUTTON_O_SELECTED: [
    ".wa-button-o:active",
    ".wa-button-0.selected",
  ],
  MAIN_CLUTTER_BAR_BUTTON_A_SELECTED: [
    ".wa-button-a:active",
    ".wa-button-a.selected",
  ],
  MAIN_CLUTTER_BAR_BUTTON_I_SELECTED: [
    ".wa-button-i:active",
    ".wa-button-i.selected",
  ],
  MAIN_CLUTTER_BAR_BUTTON_D_SELECTED: [
    ".wa-button-d:active",
    ".wa-button-d.selected",
  ],
  MAIN_CLUTTER_BAR_BUTTON_V_SELECTED: [
    ".wa-button-v:active",
    ".wa-button-v.selected",
  ],
  MAIN_SHADE_BACKGROUND: [".shade .wa-title-bar"],
  MAIN_SHADE_BACKGROUND_SELECTED: [".shade.selected .wa-title-bar"],
  MAIN_SHADE_BUTTON_SELECTED: [".shade.selected .wa-title-bar .wa-shade"],
  MAIN_SHADE_BUTTON_SELECTED_DEPRESSED: [
    ".shade .wa-title-bar .wa-shade.winamp-active",
  ],
  MAIN_SHADE_POSITION_BACKGROUND: [".shade .wa-position"],
  MAIN_SHADE_POSITION_THUMB: [
    ".shade .wa-position::-moz-range-thumb",
    ".shade .wa-position::-webkit-slider-thumb",
  ],
  MAIN_SHADE_POSITION_THUMB_LEFT: [
    ".shade .wa-position.left::-moz-range-thumb",
    ".shade .wa-position.left::-webkit-slider-thumb",
  ],
  MAIN_SHADE_POSITION_THUMB_RIGHT: [
    ".shade .wa-position.right::-moz-range-thumb",
    ".shade .wa-position.right::-webkit-slider-thumb",
  ],
  MAIN_VOLUME_BACKGROUND: [".wa-volume"],
  MAIN_VOLUME_THUMB: [
    ".wa-volume input::-webkit-slider-thumb",
    ".wa-volume input::-moz-range-thumb",
  ],
  MAIN_VOLUME_THUMB_SELECTED: [
    ".wa-volume input:active::-webkit-slider-thumb",
    ".wa-volume input:active::-moz-range-thumb",
  ],
  GEN_TOP_CENTER_FILL: [".gen-window .gen-top"],
  GEN_TOP_LEFT: [".gen-window .gen-top-left"],
  GEN_TOP_LEFT_END: [".gen-window .gen-top-left-end"],
  GEN_TOP_RIGHT: [".gen-window .gen-top-right"],
  GEN_TOP_RIGHT_END: [".gen-window .gen-top-right-end"],
  GEN_TOP_LEFT_RIGHT_FILL: [
    ".gen-window .gen-top-left-fill",
    ".gen-window .gen-top-right-fill",
  ],

  GEN_TOP_CENTER_FILL_SELECTED: [".gen-window.selected .gen-top"],
  GEN_TOP_LEFT_SELECTED: [".gen-window.selected .gen-top-left"],
  GEN_TOP_LEFT_END_SELECTED: [".gen-window.selected .gen-top-left-end"],
  GEN_TOP_RIGHT_SELECTED: [".gen-window.selected .gen-top-right"],
  GEN_TOP_RIGHT_END_SELECTED: [".gen-window.selected .gen-top-right-end"],
  GEN_TOP_LEFT_RIGHT_FILL_SELECTED: [
    ".gen-window.selected .gen-top-left-fill",
    ".gen-window.selected .gen-top-right-fill",
  ],
  GEN_BOTTOM_LEFT: [".gen-window .gen-bottom-left"],
  GEN_BOTTOM_RIGHT: [".gen-window .gen-bottom-right"],
  GEN_BOTTOM_FILL: [".gen-window .gen-bottom"],
  GEN_MIDDLE_LEFT: [".gen-window .gen-middle-left"],
  GEN_MIDDLE_LEFT_BOTTOM: [".gen-window .gen-middle-left-bottom"],
  GEN_MIDDLE_RIGHT: [".gen-window .gen-middle-right"],
  GEN_MIDDLE_RIGHT_BOTTOM: [".gen-window .gen-middle-right-bottom"],
  GEN_CLOSE_SELECTED: [".gen-window .gen-close.winamp-active"],
};

Object.keys(FONT_LOOKUP).forEach((character) => {
  const key = imageConstFromChar(character);
  const code = character.charCodeAt(0);
  imageSelectors[key] = [`.character-${code}`];
});

LETTERS.forEach((character) => {
  imageSelectors[`GEN_TEXT_${character}`] = [
    `.gen-text-${character.toLowerCase()}`,
  ];
  imageSelectors[`GEN_TEXT_SELECTED_${character}`] = [
    `.gen-window.selected .gen-text-${character.toLowerCase()}`,
  ];
});

export const cursorSelectors: Selectors = {
  CLOSE: [".wa-title-bar .wa-close"],
  // This is not quite right. There are some areas that show this cursor
  // but are not clickable.
  EQSLID: [".wa-equalizer-window .band"],
  EQNORMAL: [".wa-equalizer-window"],
  EQCLOSE: [".wa-equalizer-window .wa-equalizer-close"],
  EQTITLE: [
    ".wa-equalizer-window .title-bar",
    ".wa-equalizer-window.shade",
    ".wa-equalizer-window.shade input",
  ],
  MAINMENU: [".wa-main-window .wa-option", ".wa-webamp-context-menu .context-menu"],
  MIN: [".wa-main-window .wa-minimize"],
  NORMAL: [
    // Use this as the default cursor.
    ".window",
    ".window input", // Otherwise
    ".wa-main-window",
    ".wa-main-window.shade .wa-title-bar",
  ],
  MMENU: [".wa-main-window.shade .wa-option"],
  PNORMAL: [".wa-playlist-window"],
  // TODO: This is should really only apply to the top part of the top.
  // The chrome around the playlist window is larger than others. The
  // cursor only applies to the same height as the other window's chrome.
  PTBAR: [".wa-playlist-window .playlist-top"],
  PCLOSE: [
    ".wa-playlist-window .wa-playlist-close-button",
    ".wa-playlist-window-shade .wa-playlist-close-button",
  ],
  PWINBUT: [
    ".wa-playlist-window .wa-playlist-shade-button",
    ".wa-playlist-window-shade .wa-playlist-shade-button",
  ],
  POSBAR: [".wa-main-window .wa-position"],
  PSIZE: [".wa-playlist-window .wa-playlist-resize-target"],
  PWSSIZE: [".wa-playlist-window-shade .wa-playlist-resize-target"],
  PWSNORM: [".wa-playlist-window-shade"],
  // TODO: The target for this is not quite right.
  PVSCROLL: [".wa-playlist-window .playlist-scrollbar"],
  SONGNAME: [".wa-main-window .wa-marquee"],
  TITLEBAR: [".wa-main-window .wa-title-bar"],
  VOLBAL: [".wa-volume", ".wa-volume input", ".wa-balance"],
  WINBUT: [".wa-main-window .wa-shade"],
  WSNORMAL: [".wa-main-window.shade .wa-title-bar"],
  WSPOSBAR: [".wa-main-window.shade .wa-position"],
};
