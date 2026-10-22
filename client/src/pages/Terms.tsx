import { Link } from "wouter";
import LegalPage, { Section, Todo } from "@/components/LegalPage";

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="22 October 2026">
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
          <li>New companies get a 14-day free trial for up to 5 vehicles. No payment card is needed to start.</li>
          <li>
            Paid plans are charged per vehicle per month (or per year where offered) at the prices shown on the
            {" "}<Link href="/pricing" className="text-primary hover:underline">pricing page</Link> when you subscribe. Payments are
            processed by Stripe. Prices exclude VAT unless stated: <Todo>VAT treatment</Todo>.
          </li>
          <li>Subscriptions renew automatically until cancelled. To cancel, email us from the account owner's address; cancellation takes effect at the end of the billing period already paid for. We do not refund part-used periods, except where the law requires it.</li>
          <li>
            When a trial ends without a subscription, or a subscription is cancelled, you can still sign in, view and export
            your data, but you cannot add new jobs, vehicles or drivers until you subscribe. Nothing is deleted. If a payment
            fails, the Service keeps working while the payment is retried; if the subscription is then cancelled, the same
            restrictions apply.
          </li>
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
          <li>On request we will export your company's data in a common format (such as CSV) within 30 days, and delete it within 30 days of a written request after the agreement ends, except records we must keep by law (for example billing records).</li>
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
          offer a service-level agreement unless agreed in writing. Support is by email; we aim to reply within two working days (Monday to Friday, excluding UK bank holidays).
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          Routes, ETAs, traffic, low-bridge and weight-limit information are provided to assist planning. Drivers remain
          responsible for following road signs, restrictions and the law, and dispatchers for the decisions they make.
          We are not liable for indirect or consequential loss, or for loss of profit, revenue, business or goodwill. Our
          total liability in any 12 months is limited to the fees you paid us in the 12 months before the claim arose.
          Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </Section>

      <Section title="9. Ending the agreement">
        <p>
          You can stop using the Service at any time and cancel as described in section 4. We may end the agreement with 30 days' notice by email, or straight away for a serious breach of these terms or for non-payment after reminders. When it ends, your data stays available to view and export as described in section 4 until you ask us to delete it (section 5).
        </p>
      </Section>

      <Section title="10. Changes and law">
        <p>
          We may update these terms and will post the new version here with a new date. We will tell account owners about material changes by email at least 30 days before they take effect.
          These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.
        </p>
      </Section>
    </LegalPage>
  );
}
