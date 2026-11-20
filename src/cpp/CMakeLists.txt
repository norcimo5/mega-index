cmake_minimum_required(VERSION 3.10)
project(mega_index CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_library(mega_index_lib STATIC
  src/game.cpp src/codec.cpp src/rng.cpp src/data.cpp src/stats.cpp
  src/picks.cpp src/export.cpp src/cli.cpp)
target_include_directories(mega_index_lib PUBLIC include)
target_compile_options(mega_index_lib PUBLIC -Wall -Wextra -Wpedantic)

add_executable(mega-index src/main.cpp)
target_link_libraries(mega-index mega_index_lib)

enable_testing()
add_executable(mega-index-tests tests/test_main.cpp)
target_link_libraries(mega-index-tests mega_index_lib)
add_test(NAME mega-index-tests COMMAND mega-index-tests $<TARGET_FILE:mega-index>)
