exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ status: "Backend functions directory is officially online!" })
  };
};
