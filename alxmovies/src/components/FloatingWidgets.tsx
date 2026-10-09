import { useLocation } from "react-router-dom";
import { BirthdayHost } from "./BirthdayHost";
import { GuestWidget } from "./GuestWidget";

const HIDDEN_ON = ["/watch", "/sala"]; // telas de vídeo em tela cheia não levam widgets por cima

export function FloatingWidgets() {
  const { pathname } = useLocation();
  if (HIDDEN_ON.includes(pathname)) return null;
  return (
    <>
      <GuestWidget />
      <BirthdayHost />
    </>
  );
}
