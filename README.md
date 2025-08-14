[![progress-banner](https://backend.codecrafters.io/progress/redis/9a8f9d01-f557-4e51-bd17-c6879424a330)](https://app.codecrafters.io/users/codecrafters-bot?r=2qF)

This is a starting point for JavaScript solutions to the
["Build Your Own Redis" Challenge](https://codecrafters.io/challenges/redis).

This is code challenge for building Redis like storage from scratch.

## Features

- **Redis Protocol Implementation**: Handles basic Redis commands like `PING`, `ECHO`, `SET`, and `GET`.
- **Concurrency**: Manages multiple client connections using an event loop.
- **Extensible**: Designed to be easily extended with more Redis commands and features.

## Usage

### Getting Started

1.  **Clone the repository**:
    ```sh
    git clone https://github.com/unlikelyUsual/codecraft-redis.git
    cd codecraft-redis
    ```
2.  **Ensure Node.js is installed**: This project requires Node.js (version 21 or higher).
    You can download it from [nodejs.org](https://nodejs.org/).

### Running the Redis Server

To run your Redis server locally, execute the following command:

```sh
./your_program.sh
```

This will start the server, which is implemented in `app/main.js`.

### Submitting to CodeCrafters

If you're participating in the CodeCrafters challenge:

1.  Make your changes to the `app/main.js` file.
2.  Commit your changes:
    ```sh
    git commit -am "Your commit message"
    ```
3.  Push your solution to CodeCrafters:
    ```sh
    git push origin master
    ```
    Test output will be streamed to your terminal on the CodeCrafters platform.

## Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Commit your changes (`git commit -am 'Add new feature'`).
5.  Push to the branch (`git push origin feature/your-feature-name`).
6.  Create a new Pull Request.
