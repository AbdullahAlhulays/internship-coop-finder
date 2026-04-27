const SUBMIT_FORM_URL = "https://forms.gle/oPEHmvxeeFC4fh9R7";

export default function SubmitOpportunity() {
  return (
    <section className="submit-opportunity" aria-label="Submit an opportunity">
      <p>Found an opportunity students should see?</p>
      <a href={SUBMIT_FORM_URL} target="_blank" rel="noreferrer">
        Add it here
      </a>
    </section>
  );
}

