# Plain Makefile fallback. `make` -> build/mega-index ; `make test` -> build and run tests.
CXX      ?= g++
CXXFLAGS ?= -O2
CXXFLAGS += -std=c++17 -Wall -Wextra -Wpedantic -Iinclude
BUILD    := build
LIBSRC   := game codec rng data stats picks export cli
LIBOBJ   := $(LIBSRC:%=$(BUILD)/obj/%.o)

all: $(BUILD)/mega-index

$(BUILD)/obj/%.o: src/%.cpp $(wildcard include/mega_index/*.hpp)
	@mkdir -p $(BUILD)/obj
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD)/obj/main.o: src/main.cpp $(wildcard include/mega_index/*.hpp)
	@mkdir -p $(BUILD)/obj
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD)/obj/test_main.o: tests/test_main.cpp $(wildcard include/mega_index/*.hpp)
	@mkdir -p $(BUILD)/obj
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD)/mega-index: $(LIBOBJ) $(BUILD)/obj/main.o
	$(CXX) $(CXXFLAGS) $^ -o $@

$(BUILD)/mega-index-tests: $(LIBOBJ) $(BUILD)/obj/test_main.o
	$(CXX) $(CXXFLAGS) $^ -o $@

test: $(BUILD)/mega-index $(BUILD)/mega-index-tests
	$(BUILD)/mega-index-tests $(abspath $(BUILD)/mega-index)

clean:
	rm -rf $(BUILD)

.PHONY: all test clean
