import { SitePage } from "../SitePage";
import { Wheel } from "../Wheel";

export default function WebWheel() {
  return (
    <SitePage title="🎡 Roda da Sorte" sub="Entre na sua conta e gire uma vez por dia. O prêmio cai direto na conta, no site e no app.">
      <Wheel />
    </SitePage>
  );
}
