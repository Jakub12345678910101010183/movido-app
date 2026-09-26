import { Link } from "wouter";
import LegalPage, { Section, Todo } from "@/components/LegalPage";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="26 September 2026">
      <Section title="1. Who we are">
        <p>
          MOViDO is dispatch software provided by Movido Logistics Ltd, Northampton, United Kingdom
          (company number <Todo>company number</Todo>, registered office <Todo>registered address</Todo>).
          Contact for privacy questions: <a className="text-primary hover:underline" href="mailto:movidologistics@gmail.com">movidologistics@gmail.com</a>
          {" "}<Todo>dedicated privacy contact, if different</Todo>.
        </p>
      </Section>

      <Section title="2. Our role">
        <ul>
          <li>
            <strong>For your account and billing</strong> (the people who sign up and the company that subscribes)
            we decide how the data is used and act as <strong>controller</strong>.
          </li>
          <li>
            <strong>For the operational data you put into MOViDO</strong> — your drivers, vehicles, jobs, your
            customers' names and addresses, proof of delivery, documents and driver locations — your company is the
            controller and we process it on your behalf as <strong>processor</strong>, only to provide the service.
            A data processing agreement is <Todo>available on request / attached to the Terms</Todo>.
          </li>
        </ul>
      </Section>

      <Section title="3. What we collect">
        <ul>
          <li><strong>Accounts:</strong> name, email address, password (stored hashed by our authentication provider), role, last sign-in time.</li>
          <li><strong>Company:</strong> company name, contact email, phone and address you enter, plan and trial dates, Stripe customer reference.</li>
          <li><strong>Drivers:</strong> name, email, phone, licence details and hours you record, assigned vehicle and status.</li>
          <li>
            <strong>Driver location:</strong> when a driver turns on location sharing in the MOViDO driver screen, their phone's
            GPS position (latitude, longitude, accuracy, speed, heading and time) is sent while that screen is open. We keep the
            latest position and a position history, and use them for the dispatch map, to record arrival and departure at
            pickups, stops and deliveries, and for the customer tracking link while that job is in progress. Sharing can be
            turned off at any time and stops when the screen is closed or the phone is locked.
          </li>
          <li><strong>Vehicles:</strong> fleet number, registration, make, model, dimensions, weight, fuel level, mileage and maintenance records.</li>
          <li><strong>Jobs and customers:</strong> customer name and phone, pickup, stop and delivery addresses and coordinates, times, status and notes.</li>
          <li><strong>Proof of delivery:</strong> photo, the recipient's signature and name, and delivery time.</li>
          <li><strong>Documents:</strong> images you scan and the text recognised from them. Text recognition runs in your browser; the image and text are then stored in your company's private storage.</li>
          <li><strong>Incidents, fuel logs and messages</strong> between dispatch and drivers.</li>
          <li><strong>Technical data:</strong> IP address, browser type and request logs kept by our hosting and database providers for security and troubleshooting.</li>
        </ul>
        <p>We do not use advertising or third-party analytics trackers. The "Analytics" section of the app only summarises your own company's records.</p>
      </Section>

      <Section title="4. Customer tracking links">
        <p>
          Each job has a private link with a long random code. Anyone who has the link can see the job reference, customer
          name, delivery address, status and ETA, the vehicle, the driver's first name and — only while the job is in
          progress — the driver's position. Driver phone numbers and email addresses are never shown. Share the link only
          with the person receiving the delivery.
        </p>
      </Section>

      <Section title="5. Why we use it (lawful bases)">
        <ul>
          <li>To provide the service you subscribe to (contract).</li>
          <li>To take payment and keep financial records (contract and legal obligation).</li>
          <li>To keep the service secure and fix problems (legitimate interests).</li>
          <li>
            Driver location and other operational data are processed on your company's instructions. Your company is
            responsible for having a lawful basis and for telling its drivers how location sharing is used.
          </li>
        </ul>
      </Section>

      <Section title="6. Who we share it with">
        <p>We use these service providers, who process data for us under their own terms:</p>
        <ul>
          <li><strong>Supabase</strong> — database, sign-in and file storage (hosted in London, eu-west-2).</li>
          <li><strong>Vercel</strong> — hosting of the website and app.</li>
          <li><strong>Stripe</strong> — subscription payments. Card details go directly to Stripe; we never see or store them.</li>
          <li><strong>TomTom</strong> — maps, traffic, address lookup and truck routing. Addresses and coordinates of stops are sent to TomTom to calculate routes.</li>
          <li><strong>Resend</strong> — sending driver invitation emails.</li>
          <li><strong>Google Fonts</strong> and <strong>cdnjs (Cloudflare)</strong> — fonts and the text-recognition library are downloaded by your browser from these services, which receive your IP address.</li>
          <li><strong>Expo push service</strong> — only if a driver uses a MOViDO native app with notifications enabled.</li>
        </ul>
        <p>
          Some providers may process data outside the UK. <Todo>list transfers and safeguards, e.g. UK IDTA / adequacy</Todo>.
          We do not sell personal data.
        </p>
      </Section>

      <Section title="7. How long we keep it">
        <p>
          Account and operational data are kept while your company's subscription or trial is active.
          Retention periods: <Todo>retention for driver location history</Todo>, <Todo>retention for proof of delivery and jobs</Todo>,
          <Todo>retention after an account is closed</Todo>, <Todo>retention of billing records</Todo>.
        </p>
        <p>
          In the app, jobs that carry proof of delivery cannot be deleted, drivers with job history are kept, and scanned
          documents can be deleted by your dispatchers. To have your company's data deleted, contact us (section 10).
        </p>
      </Section>

      <Section title="8. Cookies and local storage">
        <p>
          MOViDO does not set advertising or analytics cookies. Your browser's local storage keeps your sign-in session
          (so you stay signed in), your display preferences (distance unit, map layers) and, on the driver screen, whether
          location sharing was switched on. These are strictly necessary for the app to work or remember your choices, and
          you can clear them in your browser at any time.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          Each company's data is separated at the database level, files (proof of delivery, documents) are private and
          opened with short-lived links, connections are encrypted (HTTPS) and staff access is limited to what their role
          needs.
        </p>
      </Section>

      <Section title="10. Your rights">
        <p>
          Under UK data protection law you can ask for access to, correction or deletion of your personal data, ask us to
          restrict or stop processing, and ask for a copy in a portable format. If your data was entered by an employer
          using MOViDO (for example as a driver), please contact that employer first; we will help them respond.
          Contact: <a className="text-primary hover:underline" href="mailto:movidologistics@gmail.com">movidologistics@gmail.com</a>.
          We aim to respond within one month.
        </p>
        <p>
          You can complain to the Information Commissioner's Office (<a className="text-primary hover:underline" href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>).
          ICO registration number: <Todo>ICO registration number</Todo>.
        </p>
      </Section>

      <Section title="11. Changes">
        <p>We will post changes on this page and update the date above. See also our <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>.</p>
      </Section>
    </LegalPage>
  );
}
