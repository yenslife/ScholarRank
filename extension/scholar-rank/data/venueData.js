(() => {
  /**
   * Lightweight seed dataset. Extend with exports from ConferenceRanks and JCR.
   * Each entry should include displayName plus aliases that reflect Scholar output.
   */
  const VENUE_DATA = [
    {
      type: "conference",
      displayName: "NeurIPS",
      officialName: "Conference on Neural Information Processing Systems",
      aliases: [
        "NeurIPS",
        "NIPS",
        "Advances in Neural Information Processing Systems"
      ],
      rank: "A*",
      rating: "Top-tier machine learning conference",
      area: "Artificial Intelligence & Machine Learning",
      source: "ConferenceRanks.com (AI & ML)",
      sourceUrl: "http://www.conferenceranks.com/",
      lastUpdated: "2023"
    },
    {
      type: "conference",
      displayName: "ICML",
      officialName: "International Conference on Machine Learning",
      aliases: [
        "ICML",
        "International Conference on Machine Learning"
      ],
      rank: "A*",
      rating: "Flagship ML research venue",
      area: "Artificial Intelligence & Machine Learning",
      source: "ConferenceRanks.com (AI & ML)",
      sourceUrl: "http://www.conferenceranks.com/",
      lastUpdated: "2023"
    },
    {
      type: "conference",
      displayName: "CVPR",
      officialName: "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
      aliases: [
        "CVPR",
        "Conference on Computer Vision and Pattern Recognition",
        "IEEE Conference on Computer Vision and Pattern Recognition"
      ],
      rank: "A*",
      rating: "Premier vision conference",
      area: "Computer Vision",
      source: "ConferenceRanks.com (Vision)",
      sourceUrl: "http://www.conferenceranks.com/",
      lastUpdated: "2023"
    },
    {
      type: "conference",
      displayName: "AAAI",
      officialName: "AAAI Conference on Artificial Intelligence",
      aliases: [
        "AAAI",
        "Association for the Advancement of Artificial Intelligence Conference"
      ],
      rank: "A*",
      rating: "Established general AI venue",
      area: "Artificial Intelligence",
      source: "ConferenceRanks.com (AI & ML)",
      sourceUrl: "http://www.conferenceranks.com/",
      lastUpdated: "2023"
    },
    {
      type: "journal",
      displayName: "Nature",
      officialName: "Nature",
      aliases: ["Nature"],
      rank: "Q1",
      rating: "2023 JCR Impact Factor 64.8",
      area: "Multidisciplinary Sciences",
      source: "Clarivate Journal Citation Reports (2023)",
      sourceUrl: "https://jcr.clarivate.com/",
      accessNote: "Metrics require licensed JCR access",
      lastUpdated: "2023"
    },
    {
      type: "journal",
      displayName: "Science",
      officialName: "Science",
      aliases: ["Science"],
      rank: "Q1",
      rating: "2023 JCR Impact Factor 47.7",
      area: "Multidisciplinary Sciences",
      source: "Clarivate Journal Citation Reports (2023)",
      sourceUrl: "https://jcr.clarivate.com/",
      accessNote: "Metrics require licensed JCR access",
      lastUpdated: "2023"
    },
    {
      type: "journal",
      displayName: "IEEE TPAMI",
      officialName: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
      aliases: [
        "IEEE Transactions on Pattern Analysis and Machine Intelligence",
        "IEEE TPAMI",
        "TPAMI"
      ],
      rank: "Q1",
      rating: "2023 JCR Impact Factor 24.3",
      area: "Computer Science, Artificial Intelligence",
      source: "Clarivate Journal Citation Reports (2023)",
      sourceUrl: "https://jcr.clarivate.com/",
      accessNote: "Metrics require licensed JCR access",
      lastUpdated: "2023"
    },
    {
      type: "journal",
      displayName: "JMLR",
      officialName: "Journal of Machine Learning Research",
      aliases: [
        "Journal of Machine Learning Research",
        "JMLR"
      ],
      rank: "Q1",
      rating: "2023 JCR Impact Factor 8.3",
      area: "Artificial Intelligence & Machine Learning",
      source: "Clarivate Journal Citation Reports (2023)",
      sourceUrl: "https://jcr.clarivate.com/",
      accessNote: "Metrics require licensed JCR access",
      lastUpdated: "2023"
    }
  ];

  window.SCHOLAR_RANK_DATA = VENUE_DATA;
})();
