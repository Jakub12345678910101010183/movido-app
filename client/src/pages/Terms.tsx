import { Link } from "wouter";
import LegalPage, { Section, Todo } from "@/components/LegalPage";

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="26 September 2026">
      <Section title="1. About these terms">
        <p>
          These terms apply to the MOViDO web application at movidologistics.uk ("the Service"), provided by
          Movido Logistics Ltd (company number <Todo>company number</Todo>, registered office <Todo>registered address</Todo>)
          ("we", "us"). By creating an account or using the Service on behalf of a company, you accept these terms for that
          company ("the Customer") and confirm you are authorised to do so. The Service is for business use only.
        </p>
      </Section>

      <Section title="2. The Service">
        <p>
          MOViDO lets a transport company manage vehicles, drivers and jobs with multiple stops, plan truck routes, follow
          drivers who share their location from the driver screen, collect proof of delivery, give customers tracking links,
          and record incidents, fuel, maintenance and working hours. Features may change as the product develops.
        </p>
        <ul>
          <li>
            <strong>Routes and maps</strong> are provided by TomTom and are guidance only. Drivers remain responsible for
            obeying road signs, restrictions (including height, width and weight limits) and the law.
          </li>
          <li>
            <strong>Location sharing</strong> works while the MOViDO driver screen is open; phones may pause it when the
            screen is locked or the browser is closed.
          </li>
          <li>
            <strong>Working time and hours</strong> shown in MOViDO come from hours you record. MOViDO is not a tachograph
            and does not replace the records you are legally required to keep.
          </li>
          <li>
            <strong>Clean Air Zone</strong> markings are approximate. Check charges and compliance for your vehicles on GOV.UK.
          </li>
        </ul>
      </Section>

      <Section title="3. Accounts">
        <ul>
          <li>Keep sign-in details confidential. You are responsible for activity under your company's accounts.</li>
          <li>Administrators control who has access, which roles they have, and can disable or remove users.</li>
          <li>Tell us promptly at <a className="text-primary hover:underline" href="mailto:movidologistics@gmail.com">movidologistics@gmail.com</a> if you suspect unauthorised access.</li>
        </ul>
      </Section>

      <Section title="4. Free trial, plans and payment">
        <ul>
          <li>New companies get a 14-day free trial. No payment card is needed to start.</li>
          <li>
            Paid plans are charged per vehicle per month (or per year where offered) at the prices shown on the
            {" "}<Link href="/pricing" className="text-primary hover:underline">pricing page</Link> when you subscribe. Payments are
            processed by Stripe. Prices exclude VAT unless stated: <Todo>VAT treatment</Todo>.
          </li>
          <li>Subscriptions renew automatically until cancelled. <Todo>how to cancel, notice period, refunds</Todo>.</li>
          <li>What happens when a trial ends without a subscription, or a payment fails: <Todo>access after trial / failed payment</Todo>.</li>
        </ul>
      </Section>

      <Section title="5. Your data">
        <ul>
          <li>You own the data you enter. We use it only to provide the Service, as described in the <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.</li>
          <li>
            You are responsible for having a lawful basis for the personal data you enter — in particular your drivers'
            location — and for telling your drivers and customers how it is used.
          </li>
          <li>Only share customer tracking links with the person receiving the delivery.</li>
          <li>On request we will export or delete your company's data: <Todo>export/deletion process and timescale after termination</Todo>.</li>
        </ul>
      </Section>

      <Section title="6. Acceptable use">
        <p>You must not:</p>
        <ul>
          <li>use the Service unlawfully, or to track anyone who has not been told about it;</li>
          <li>try to access other companies' data, probe or disrupt the Service, or bypass its security;</li>
          <li>upload malicious files or content you have no right to use;</li>
          <li>resell the Service without our written agreement.</li>
        </ul>
        <p>We may suspend access that breaches these rules or puts the Service or other customers at risk.</p>
      </Section>

      <Section title="7. Availability and support">
        <p>
          We work to keep the Service available but do not guarantee it will be uninterrupted or error-free, and we do not
          offer a service-level agreement unless agreed in writing. Support is by email: <Todo>support hours / response targets, if any</Todo>.
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          <Todo>limitation of liability wording — to be drafted by a lawyer</Todo>. Nothing in these terms limits liability
          that cannot be limited by law.
        </p>
      </Section>

      <Section title="9. Ending the agreement">
        <p>
          You can stop using the Service at any time. <Todo>termination rights, notice and what happens to data</Todo>.
        </p>
      </Section>

      <Section title="10. Changes and law">
        <p>
          We may update these terms and will post the new version here with a new date. <Todo>notice period for material changes</Todo>.
          These terms are governed by the law of <Todo>governing law and courts, e.g. England and Wales</Todo>.
        </p>
      </Section>
    </LegalPage>
  );
}
