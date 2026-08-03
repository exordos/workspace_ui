import React from "react";
import AccountCircleIcon from "../assets/icons/account_circle.svg?react";
import AddIcon from "../assets/icons/add.svg?react";
import AlternateEmailIcon from "../assets/icons/alternate_email.svg?react";
import AtIcon from "../assets/icons/at.svg?react";
import AttachIcon from "../assets/icons/attach.svg?react";
import BellIcon from "../assets/icons/bell.svg?react";
import BellOffIcon from "../assets/icons/bell_off.svg?react";
import BlockIcon from "../assets/icons/block.svg?react";
import BorderColorIcon from "../assets/icons/border_color.svg?react";
import BuildIcon from "../assets/icons/build.svg?react";
import BusinessCenterIcon from "../assets/icons/business_center.svg?react";
import CalendarIcon from "../assets/icons/calendar.svg?react";
import CalendarMonthIcon from "../assets/icons/calendar_month.svg?react";
import CelebrationIcon from "../assets/icons/celebration.svg?react";
import ChannelsIcon from "../assets/icons/channels.svg?react";
import ChatBubbleIcon from "../assets/icons/chat_bubble.svg?react";
import ChatBubbleOutlineIcon from "../assets/icons/chat_bubble_outline.svg?react";
import CheckIcon from "../assets/icons/check.svg?react";
import ChevronDownIcon from "../assets/icons/chevron-down.svg?react";
import ChevronRightIcon from "../assets/icons/chevron-right.svg?react";
import ChevronUpIcon from "../assets/icons/chevron-up.svg?react";
import CloseIcon from "../assets/icons/close.svg?react";
import CopyIcon from "../assets/icons/copy.svg?react";
import DashboardCustomizeIcon from "../assets/icons/dashboard_customize.svg?react";
import DeleteIcon from "../assets/icons/delete.svg?react";
import DeleteHistoryIcon from "../assets/icons/delete_history.svg?react";
import DownloadIcon from "../assets/icons/download.svg?react";
import DraftsIcon from "../assets/icons/drafts.svg?react";
import DraftsCompactIcon from "../assets/icons/drafts_compact.svg?react";
import DrawIcon from "../assets/icons/draw.svg?react";
import FilesIcon from "../assets/icons/files.svg?react";
import FlagIcon from "../assets/icons/flag.svg?react";
import FolderIcon from "../assets/icons/folder.svg?react";
import FolderCopyIcon from "../assets/icons/folder_copy.svg?react";
import FolderOpenIcon from "../assets/icons/folder_open.svg?react";
import FoldersIcon from "../assets/icons/folders.svg?react";
import ForwardIcon from "../assets/icons/forward.svg?react";
import FullscreenIcon from "../assets/icons/fullscreen.svg?react";
import FullscreenExitIcon from "../assets/icons/fullscreen_exit.svg?react";
import GlobeLocationPinIcon from "../assets/icons/globe_location_pin.svg?react";
import GridIcon from "../assets/icons/grid.svg?react";
import GroupIcon from "../assets/icons/group.svg?react";
import HandshakeIcon from "../assets/icons/handshake.svg?react";
import HeartIcon from "../assets/icons/heart.svg?react";
import HomeIcon from "../assets/icons/home.svg?react";
import HomeFilledIcon from "../assets/icons/home_filled.svg?react";
import ImagesIcon from "../assets/icons/images.svg?react";
import InfoIcon from "../assets/icons/info.svg?react";
import LabProfileIcon from "../assets/icons/lab_profile.svg?react";
import LanguageIcon from "../assets/icons/language.svg?react";
import LinksIcon from "../assets/icons/links.svg?react";
import LinksCompactIcon from "../assets/icons/links_compact.svg?react";
import ListBulletedIcon from "../assets/icons/list_bulleted.svg?react";
import ListsIcon from "../assets/icons/lists.svg?react";
import LogoutIcon from "../assets/icons/logout.svg?react";
import LogoutCompactIcon from "../assets/icons/logout_compact.svg?react";
import MagicWandIcon from "../assets/icons/magic_wand.svg?react";
import MailIcon from "../assets/icons/mail.svg?react";
import MailActivityIcon from "../assets/icons/mail_activity.svg?react";
import MailActivityCompactIcon from "../assets/icons/mail_activity_compact.svg?react";
import MailOutlineIcon from "../assets/icons/mail_outline.svg?react";
import MarkerIcon from "../assets/icons/marker.svg?react";
import MarkerOutlineIcon from "../assets/icons/marker_outline.svg?react";
import MoodIcon from "../assets/icons/mood.svg?react";
import MoreIcon from "../assets/icons/more.svg?react";
import MoreVertIcon from "../assets/icons/more_vert.svg?react";
import NewWindowIcon from "../assets/icons/new_window.svg?react";
import PenIcon from "../assets/icons/pen.svg?react";
import PersonAddIcon from "../assets/icons/person_add.svg?react";
import PhoneIcon from "../assets/icons/phone.svg?react";
import PhotoCameraIcon from "../assets/icons/photo_camera.svg?react";
import PinIcon from "../assets/icons/pin.svg?react";
import PlusIcon from "../assets/icons/plus.svg?react";
import ProfileIcon from "../assets/icons/profile.svg?react";
import ReplyIcon from "../assets/icons/reply.svg?react";
import ScheduleIcon from "../assets/icons/schedule.svg?react";
import SearchIcon from "../assets/icons/search.svg?react";
import SelectedBookmarkIcon from "../assets/icons/selected_bookmark_icon.svg?react";
import SendIcon from "../assets/icons/send.svg?react";
import SentimentSatisfiedIcon from "../assets/icons/sentiment_satisfied.svg?react";
import SidePanelIcon from "../assets/icons/side_panel.svg?react";
import SmileIcon from "../assets/icons/smile.svg?react";
import SparklesIcon from "../assets/icons/sparkles.svg?react";
import StarIcon from "../assets/icons/star.svg?react";
import StarOutlineIcon from "../assets/icons/star_outline.svg?react";
import StylusIcon from "../assets/icons/stylus.svg?react";
import ThumbsUpIcon from "../assets/icons/thumbs-up.svg?react";
import TopicFollowIcon from "../assets/icons/topic_follow.svg?react";
import TopicInheritIcon from "../assets/icons/topic_inherit.svg?react";
import TopicMuteIcon from "../assets/icons/topic_mute.svg?react";
import TopicUnmuteIcon from "../assets/icons/topic_unmute.svg?react";
import VideosIcon from "../assets/icons/videos.svg?react";
import VisibilityIcon from "../assets/icons/visibility.svg?react";
import VolumeUpIcon from "../assets/icons/volume_up.svg?react";
import type { IconSvgComponent } from "./icon.types";

export type { IconSvgComponent } from "./icon.types";

const ICONS: Record<string, IconSvgComponent> = {
  accountCircle: AccountCircleIcon,
  home: HomeIcon,
  // Solid home for activity Favorites chip (outline `home` stays for profile actions)
  home_filled: HomeFilledIcon,
  flag: FlagIcon,
  attach: AttachIcon,
  search: SearchIcon,
  selected_bookmark_icon: SelectedBookmarkIcon,
  topic_follow: TopicFollowIcon,
  topic_inherit: TopicInheritIcon,
  topic_mute: TopicMuteIcon,
  topic_unmute: TopicUnmuteIcon,
  star: StarIcon,
  pin: PinIcon,
  at: AtIcon,
  smile: SmileIcon,
  pen: PenIcon,
  // Pencil badge on editable profile avatar (Figma stylus)
  stylus: StylusIcon,
  photo_camera: PhotoCameraIcon,
  person_add: PersonAddIcon,
  folder: FolderIcon,
  folder_open: FolderOpenIcon,
  folder_copy: FolderCopyIcon,
  folders: FoldersIcon,
  plus: PlusIcon,
  add: AddIcon,
  phone: PhoneIcon,
  send: SendIcon,
  sparkles: SparklesIcon,
  check: CheckIcon,
  copy: CopyIcon,
  delete: DeleteIcon,
  // Clock + trash — auth idle timeout (Figma delete_history)
  delete_history: DeleteHistoryIcon,
  download: DownloadIcon,
  // Palette/pen stroke — theme settings (Figma draw)
  draw: DrawIcon,
  forward: ForwardIcon,
  profile: ProfileIcon,
  reply: ReplyIcon,
  close: CloseIcon,
  bell: BellIcon,
  bell_off: BellOffIcon,
  block: BlockIcon,
  // Pen with underline — profile "Edit" action (Figma border_color)
  border_color: BorderColorIcon,
  // Wrench — select build (Figma build)
  build: BuildIcon,
  channels: ChannelsIcon,
  more: MoreIcon,
  heart: HeartIcon,
  star_outline: StarOutlineIcon,
  "thumbs-up": ThumbsUpIcon,
  "chevron-down": ChevronDownIcon,
  "chevron-up": ChevronUpIcon,
  "chevron-right": ChevronRightIcon,
  // 3 tiles + plus — current server (Figma dashboard_customize)
  dashboard_customize: DashboardCustomizeIcon,
  grid: GridIcon,
  chatBubble: ChatBubbleIcon,
  calendar: CalendarIcon,
  calendar_month: CalendarMonthIcon,
  celebration: CelebrationIcon,
  mail: MailIcon,
  // Activity Inbox envelope — padded 24×24 for expanded chips.
  mail_activity: MailActivityIcon,
  // Same envelope, cropped viewBox for compact activity rail optical size.
  mail_activity_compact: MailActivityCompactIcon,
  mail_outline: MailOutlineIcon,
  magic_wand: MagicWandIcon,
  info: InfoIcon,
  // Clipboard checklist — connection diagnostics (Figma lab_profile)
  lab_profile: LabProfileIcon,
  language: LanguageIcon,
  logout: LogoutIcon,
  // Same door+arrow as `logout`; crop keeps Material optical center (extra left pad)
  logout_compact: LogoutCompactIcon,
  globe_location_pin: GlobeLocationPinIcon,
  group: GroupIcon,
  businessCenter: BusinessCenterIcon,
  handshake: HandshakeIcon,
  schedule: ScheduleIcon,
  volumeUp: VolumeUpIcon,
  newWindow: NewWindowIcon,
  marker: MarkerIcon,
  // Thin outline bookmark — Figma 5905:27795 (compact activity starred).
  marker_outline: MarkerOutlineIcon,
  alternate_email: AlternateEmailIcon,
  mood: MoodIcon,
  // Smiling face — status row (Figma sentiment_satisfied)
  sentiment_satisfied: SentimentSatisfiedIcon,
  drafts: DraftsIcon,
  // Solid filled-tip pencil — compact activity rail only.
  drafts_compact: DraftsCompactIcon,
  moreVert: MoreVertIcon,
  // Right-panel toggle (square with side strip)
  sidePanel: SidePanelIcon,
  images: ImagesIcon,
  videos: VideosIcon,
  visibility: VisibilityIcon,
  files: FilesIcon,
  links: LinksIcon,
  // Same chain glyph as `links`, tighter viewBox for 32px menu rows (does not replace `links`)
  links_compact: LinksCompactIcon,
  list_bulleted: ListBulletedIcon,
  // Dense list rows — chat list density (Figma lists)
  lists: ListsIcon,
  chat_bubble_outline: ChatBubbleOutlineIcon,
  fullscreen: FullscreenIcon,
  fullscreen_exit: FullscreenExitIcon,
};

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

interface IconComponentProps {
  name: IconName;
  size?: number;
  className?: string;
}

export const Icon = React.memo<IconComponentProps>(({ name, size = 20, className = "" }) => {
  const SvgIcon = ICONS[name];
  if (!SvgIcon) return null;
  return (
    <SvgIcon width={size} height={size} className={`shrink-0 ${className}`.trim()} aria-hidden />
  );
});
