function isAdmin(request, env) {
  const authorization = request.headers.get("Authorization");

  if (!env.ADMIN_TOKEN || !authorization) {
    return false;
  }

  return authorization === `Bearer ${env.ADMIN_TOKEN}`;
}

function unauthorizedResponse() {
  return Response.json(
    {
      success: false,
      message: "Unauthorized.",
    },
    { status: 401 }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================
    // SUBMIT REVIEW
    // =========================
    if (url.pathname === "/api/reviews" && request.method === "POST") {
      try {
        const data = await request.json();

        const name = String(data.name || "").trim();
        const eventType = String(data.eventType || "").trim();
        const rating = Number(data.rating);
        const review = String(data.message || "").trim();

        if (!name || !eventType || !review || !rating) {
          return Response.json(
            {
              success: false,
              message: "Please complete all required review fields.",
            },
            { status: 400 }
          );
        }

        if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
          return Response.json(
            {
              success: false,
              message: "Rating must be between 1 and 5 stars.",
            },
            { status: 400 }
          );
        }

        await env.DB.prepare(
          `INSERT INTO reviews
            (name, event_type, rating, review, status)
           VALUES (?, ?, ?, ?, 'pending')`
        )
          .bind(name, eventType, rating, review)
          .run();

        return Response.json({
          success: true,
          message:
            "Thank you! Your review has been received and will be reviewed before appearing on our website.",
        });
      } catch (error) {
        console.error("Review submission error:", error);

        return Response.json(
          {
            success: false,
            message: "Something went wrong while submitting your review.",
          },
          { status: 500 }
        );
      }
    }

    // =========================
    // GET APPROVED REVIEWS
    // =========================
    if (url.pathname === "/api/reviews" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          `SELECT id, name, event_type, rating, review, photo_url, created_at
           FROM reviews
           WHERE status = 'approved'
           ORDER BY created_at DESC`
        ).all();

        return Response.json({
          success: true,
          reviews: results,
        });
      } catch (error) {
        console.error("Review retrieval error:", error);

        return Response.json(
          {
            success: false,
            message: "Unable to load reviews.",
          },
          { status: 500 }
        );
      }
    }

    // =========================
    // ADMIN: GET REVIEWS
    // =========================
    if (
      url.pathname === "/api/admin/reviews" &&
      request.method === "GET"
    ) {
      if (!isAdmin(request, env)) {
        return unauthorizedResponse();
      }

      try {
        const status = url.searchParams.get("status") || "pending";

        const allowedStatuses = ["pending", "approved", "rejected"];

        if (!allowedStatuses.includes(status)) {
          return Response.json(
            {
              success: false,
              message: "Invalid review status.",
            },
            { status: 400 }
          );
        }

        const { results } = await env.DB.prepare(
          `SELECT id, name, event_type, rating, review, photo_url, status, created_at
           FROM reviews
           WHERE status = ?
           ORDER BY created_at DESC`
        )
          .bind(status)
          .all();

        return Response.json({
          success: true,
          reviews: results,
        });
      } catch (error) {
        console.error("Admin review retrieval error:", error);

        return Response.json(
          {
            success: false,
            message: "Unable to load review management data.",
          },
          { status: 500 }
        );
      }
    }

    // =========================
    // ADMIN: APPROVE / REJECT
    // =========================
    if (
      url.pathname.startsWith("/api/admin/reviews/") &&
      request.method === "PATCH"
    ) {
      if (!isAdmin(request, env)) {
        return unauthorizedResponse();
      }

      try {
        const reviewId = Number(
          url.pathname.split("/").pop()
        );

        if (!Number.isInteger(reviewId) || reviewId < 1) {
          return Response.json(
            {
              success: false,
              message: "Invalid review ID.",
            },
            { status: 400 }
          );
        }

        const data = await request.json();
        const status = String(data.status || "").trim();

        if (!["approved", "rejected"].includes(status)) {
          return Response.json(
            {
              success: false,
              message: "Status must be approved or rejected.",
            },
            { status: 400 }
          );
        }

        const result = await env.DB.prepare(
          `UPDATE reviews
           SET status = ?
           WHERE id = ?`
        )
          .bind(status, reviewId)
          .run();

        if (!result.meta.changes) {
          return Response.json(
            {
              success: false,
              message: "Review not found.",
            },
            { status: 404 }
          );
        }

        return Response.json({
          success: true,
          message:
            status === "approved"
              ? "Review approved successfully."
              : "Review rejected successfully.",
        });
      } catch (error) {
        console.error("Admin review update error:", error);

        return Response.json(
          {
            success: false,
            message: "Unable to update the review.",
          },
          { status: 500 }
        );
      }
    }

    // =========================
    // SERVE WEBSITE
    // =========================
    return env.ASSETS.fetch(request);
  },
};