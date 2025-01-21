// types/notification.ts

export type NotificationType =
  | 'leave'
  | 'attendance'
  | 'overtime'
  | 'shift'
  | 'check-in'
  | 'check-out'
  | 'overtime-digest'
  | 'overtime-batch-approval'
  | 'location-assistance'
  | 'location-verification';

export interface LineFlexText {
  type: 'text';
  text: string;
  size?:
    | 'xxs'
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | 'xxl'
    | 'xxxl'
    | '3xl'
    | '4xl'
    | '5xl';
  weight?: 'regular' | 'bold';
  color?: string;
  style?: 'normal' | 'italic';
  decoration?: 'none' | 'underline' | 'line-through';
  align?: 'start' | 'end' | 'center';
  wrap?: boolean;
  maxLines?: number;
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
}

export interface LineFlexButton {
  type: 'button';
  action: {
    type: 'uri' | 'postback' | 'message';
    label: string;
    uri?: string;
    data?: string;
    text?: string;
  };
  style?: 'primary' | 'secondary' | 'link';
  color?: string;
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  height?: 'sm' | 'md';
}

export interface LineFlexBox {
  type: 'box';
  layout: 'horizontal' | 'vertical' | 'baseline';
  contents: (LineFlexText | LineFlexButton | LineFlexBox)[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  cornerRadius?: string;
  width?: string;
  height?: string;
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  paddingAll?: string;
  padding?: string;
}
