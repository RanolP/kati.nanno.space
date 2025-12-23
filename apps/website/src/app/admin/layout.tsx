import type { JSX } from 'solid-js';

export const ssg = false;

interface Props {
  children?: JSX.Element;
}
export default function AdminLayout(props: Props) {
  return <>{props.children}</>;
}
